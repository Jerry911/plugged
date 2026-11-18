// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The secret in the QR code of a project: who gets it, that it stays the same, and that a new one stops the printed codes.
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class QrKeyTest {
    static final String JSON = "{\"footer\":{\"titel\":\"Woning\"},\"een\":[],\"sit\":[]}";

    @Autowired
    com.pleysje.plugged.repository.SymbolRepository symbolsToClean;
    @Autowired
    MockMvc mvc;
    @Autowired
    ProjectRepository repository;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;

    AppUser alice, bob, carol;

    @BeforeEach
    void clean() {
        com.pleysje.plugged.TestAccounts.clean(groups, repository, users, symbolsToClean);
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
        carol = account(users, "Carol", false);
    }

    private long create(AppUser user) throws Exception {
        String answer = mvc.perform(post("/api/projects").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(JSON))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return Long.parseLong(answer.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }

    private String key(AppUser user, long id) throws Exception {
        String answer = mvc.perform(get("/api/projects/" + id + "/qr-key").with(as(user))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store"))).andReturn().getResponse().getContentAsString();
        return answer.replaceAll(".*\"key\":\"([^\"]+)\".*", "$1");
    }

    private void expectPublic(long id, String key, int status) throws Exception {
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", key)).andExpect(status().is(status));
    }

    @Test
    void theKeyIsMadeOnceAndStaysTheSameWhenTheSchemaChanges() throws Exception {
        long id = create(alice);
        String version = mvc.perform(get("/api/projects/" + id).with(as(alice))).andReturn().getResponse().getHeader(HttpHeaders.ETAG);
        String key = key(alice, id);
        assertNotEquals("", key);
        assertEquals(43, key.length());
        assertEquals(key, key(alice, id));
        // making the key is no new version of the project: an editor that has it open can still save
        assertEquals(version, mvc.perform(get("/api/projects/" + id).with(as(alice))).andReturn().getResponse().getHeader(HttpHeaders.ETAG));
        mvc.perform(put("/api/projects/" + id).with(as(alice)).header(HttpHeaders.IF_MATCH, version).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.replace("Woning", "Nieuw"))).andExpect(status().isNoContent());
        assertEquals(key, key(alice, id));
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", key)).andExpect(status().isOk())
                .andExpect(jsonPath("$.footer.titel").value("Nieuw"));
    }

    @Test
    void theKeyIsNotInTheDocument() throws Exception {
        long id = create(alice);
        String key = key(alice, id);
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(content().string(not(containsString(key))));
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", key)).andExpect(content().string(not(containsString(key))));
    }

    @Test
    void whoCannotOpenTheProjectGetsNoKey() throws Exception {
        long id = create(alice);
        mvc.perform(get("/api/projects/" + id + "/qr-key").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(post("/api/projects/" + id + "/qr-key").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/" + id + "/qr-key")).andExpect(status().isUnauthorized());
    }

    @Test
    void aMemberOfAGroupItIsSharedWithGetsTheKeyButCannotRenewIt() throws Exception {
        long id = create(alice);
        UserGroup group = new UserGroup("Klas");
        group.getMembers().addAll(List.of(alice, bob));
        group = groups.save(group);
        mvc.perform(put("/api/projects/" + id + "/groups").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"groupIds\":[" + group.getId() + "]}"))
                .andExpect(status().isOk());
        assertEquals(key(alice, id), key(bob, id));
        mvc.perform(post("/api/projects/" + id + "/qr-key").with(as(bob))).andExpect(status().isForbidden());
        mvc.perform(get("/api/projects/" + id + "/qr-key").with(as(carol))).andExpect(status().isNotFound());
    }

    @Test
    void aNewKeyStopsTheCodesPrintedBefore() throws Exception {
        long id = create(alice);
        String old = key(alice, id);
        expectPublic(id, old, 200);
        String answer = mvc.perform(post("/api/projects/" + id + "/qr-key").with(as(alice))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String renewed = answer.replaceAll(".*\"key\":\"([^\"]+)\".*", "$1");
        assertNotEquals(old, renewed);
        assertEquals(renewed, key(alice, id));
        expectPublic(id, old, 404);
        expectPublic(id, renewed, 200);
    }

    @Test
    void aCopyHasAKeyOfItsOwn() throws Exception {
        long id = create(alice);
        String key = key(alice, id);
        String answer = mvc.perform(post("/api/projects/" + id + "/copy").with(as(alice))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long copy = Long.parseLong(answer.replaceAll(".*\"id\":(\\d+).*", "$1"));
        expectPublic(copy, key, 404);
        assertNotEquals(key, key(alice, copy));
    }

    @Test
    void thePrimaryAdministratorMayRenewTheKeyOfAnybodysProject() throws Exception {
        AppUser primary = account(users, "Admin", true); // admin@example.be: the address of plugged.admin.email
        long id = create(alice);
        String old = key(alice, id);
        assertEquals(old, key(primary, id));
        mvc.perform(post("/api/projects/" + id + "/qr-key").with(as(primary))).andExpect(status().isOk());
        expectPublic(id, old, 404);
        expectPublic(id, key(alice, id), 200);
    }

    @Test
    void anotherAdministratorIsNoPrimaryAdministrator() throws Exception {
        AppUser other = account(users, "Dave", true);
        long id = create(alice);
        String old = key(alice, id);
        mvc.perform(post("/api/projects/" + id + "/qr-key").with(as(other))).andExpect(status().is4xxClientError());
        expectPublic(id, old, 200);
    }

    @Test
    void theKeyOfOneProjectOpensNoOtherProject() throws Exception {
        long first = create(alice), second = create(alice);
        String firstKey = key(alice, first), secondKey = key(alice, second);
        assertNotEquals(firstKey, secondKey);
        expectPublic(first, secondKey, 404);
        expectPublic(second, firstKey, 404);
        expectPublic(second, secondKey, 200);
    }

    @Test
    void aProjectTakenOutOfTheTrashIsSeenAgainWithTheSameCode() throws Exception {
        long id = create(alice);
        String key = key(alice, id);
        mvc.perform(delete("/api/projects/" + id).with(as(alice))).andExpect(status().is2xxSuccessful());
        expectPublic(id, key, 404);
        mvc.perform(post("/api/projects/" + id + "/untrash").with(as(alice))).andExpect(status().is2xxSuccessful());
        expectPublic(id, key, 200);
    }

    @Test
    void whoScansCanOnlyRead() throws Exception {
        long id = create(alice);
        String key = key(alice, id);
        for (var request : List.of(put("/api/public/schemas/" + id), post("/api/public/schemas/" + id), delete("/api/public/schemas/" + id)))
            assertNotEquals(2, mvc.perform(request.header("X-Schema-Key", key).contentType(MediaType.APPLICATION_JSON).content("{\"footer\":{\"titel\":\"Gehackt\"}}"))
                    .andReturn().getResponse().getStatus() / 100);
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", key)).andExpect(status().isOk()).andExpect(jsonPath("$.footer.titel").value("Woning"));
    }
}
