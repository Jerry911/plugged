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
import org.springframework.test.web.servlet.ResultActions;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// admin@example.be is the primary administrator (the Hoofdbeheerder); "Beheer" is an administrator as well, but not the primary one
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class ProjectControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    ProjectRepository repository;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    com.pleysje.plugged.config.ProjectIds projectIds;

    AppUser alice, bob, carol, admin, otherAdmin;

    @BeforeEach
    void clean() {
        com.pleysje.plugged.TestAccounts.clean(groups, repository, users);
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
        carol = account(users, "Carol", false);
        admin = account(users, "Admin", true);
        otherAdmin = account(users, "Beheer", true);
    }

    /** The version (ETag) of the project as this user sees it now; "0" when he cannot open it. */
    private String versionOf(AppUser user, long id) throws Exception {
        var response = mvc.perform(get("/api/projects/" + id).with(as(user))).andReturn().getResponse();
        return response.getStatus() == 200 ? response.getHeader(HttpHeaders.ETAG) : "\"0\"";
    }

    /** Saves like the editor does: based on the version it opened. */
    private ResultActions putProject(AppUser user, long id, String json) throws Exception {
        return putProject(user, id, json, versionOf(user, id));
    }

    private ResultActions putProject(AppUser user, long id, String json, String version) throws Exception {
        return mvc.perform(put("/api/projects/" + id).with(as(user)).header(HttpHeaders.IF_MATCH, version).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private long create(AppUser user, String json) throws Exception {
        String answer = mvc.perform(post("/api/projects").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return Long.parseLong(answer.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }

    private UserGroup group(String name, AppUser... members) {
        UserGroup group = new UserGroup(name);
        group.getMembers().addAll(List.of(members));
        return groups.save(group);
    }

    private ResultActions share(AppUser user, long id, Long... groupIds) throws Exception {
        String ids = String.join(",", java.util.Arrays.stream(groupIds).map(String::valueOf).toList());
        return mvc.perform(put("/api/projects/" + id + "/groups").with(as(user)).contentType(MediaType.APPLICATION_JSON).content("{\"groupIds\":[" + ids + "]}"));
    }

    @Test
    void unknownProjectIs404() throws Exception {
        mvc.perform(get("/api/projects/99").with(as(alice))).andExpect(status().isNotFound());
    }

    @Test
    void putThenGetRoundTrips() throws Exception {
        long id = create(alice, "{}");
        putProject(alice, id, "{\"een\":[{\"id\":\"e1\",\"name\":\"Blad 1\"}],\"footer\":{\"titel\":\"Test\"}}").andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.footer.titel", is("Test"))).andExpect(jsonPath("$.een[0].name", is("Blad 1")));
    }

    @Test
    void putOverwrites() throws Exception {
        long id = create(alice, "{\"v\":1}");
        putProject(alice, id, "{\"v\":2}").andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(jsonPath("$.v", is(2)));
    }

    @Test
    void theServerGivesTheNumbersAndAClientCannotChooseOne() throws Exception {
        long first = create(alice, "{\"v\":1}"), second = create(bob, "{\"v\":2}");
        assertTrue(second > first);
        // a number that does not exist is not created by a save
        putProject(bob, second + 1000, "{}", "\"0\"").andExpect(status().isNotFound());
        putProject(bob, Long.MAX_VALUE, "{}", "\"0\"").andExpect(status().isNotFound());
        assertTrue(create(bob, "{}") > second);
        mvc.perform(post("/api/projects").param("name", "  Woning Jan ").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNumber()).andExpect(jsonPath("$.version", is(0)))
                .andExpect(header().string(HttpHeaders.ETAG, "\"0\""));
        mvc.perform(get("/api/projects/summaries").with(as(alice))).andExpect(jsonPath("$[1].name", is("Woning Jan")));
    }

    @Test
    void theNumbersContinueAfterTheProjectsOfAnOlderDatabase() throws Exception {
        // an older version chose the numbers itself: a project 900 is already there when this version starts
        long highest = create(alice, "{}") + 900;
        jdbc.update("insert into project_doc (id, json, version) values (?, '{}', 0)", highest);
        projectIds.afterSingletonsInstantiated();
        assertTrue(create(alice, "{}") > highest);
    }

    @Test
    void everySaveIsANewVersionAndAnOlderVersionIsRefused() throws Exception {
        UserGroup team = group("Team", alice, bob);
        long id = create(alice, "{\"v\":1}");
        share(alice, id, team.getId()).andExpect(status().isOk());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(header().string(HttpHeaders.ETAG, "\"0\""));
        // Alice and Bob both open version 0; Alice saves first
        putProject(alice, id, "{\"v\":2}", "\"0\"").andExpect(status().isNoContent()).andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
        // Bob's save is based on version 0: refused, Alice's work stays
        putProject(bob, id, "{\"v\":3}", "\"0\"").andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("project.changedElsewhere")));
        mvc.perform(get("/api/projects/" + id).with(as(bob))).andExpect(jsonPath("$.v", is(2))).andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
        // after loading it again he can save (a weak ETag works too)
        putProject(bob, id, "{\"v\":3}", "W/\"1\"").andExpect(status().isNoContent()).andExpect(header().string(HttpHeaders.ETAG, "\"2\""));
        // without a version: 428
        mvc.perform(put("/api/projects/" + id).with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isPreconditionRequired()).andExpect(jsonPath("$.messageKey", is("project.versionRequired")));
        mvc.perform(put("/api/projects/" + id).with(as(alice)).header(HttpHeaders.IF_MATCH, "nonsense").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isPreconditionRequired());
    }

    @Test
    void onlyDocumentsTheEditorCanOpenAreStored() throws Exception {
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("project.invalidJson")));
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("[1,2]"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("project.invalidStructure")));
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"een\":\"x\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("een")));
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"sit\":[{\"walls\":{}}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail", containsString("sit[0].walls")));
        long id = create(alice, "{\"een\":[{\"tree\":[]}],\"sit\":[{\"walls\":[],\"items\":[]}],\"footer\":{},\"name\":\"ok\"}");
        putProject(alice, id, "{\"footer\":[]}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("project.invalidStructure")));
        // an older format (one tree and one plan) is fine: the editor converts it
        create(alice, "{\"tree\":[],\"plan\":{\"walls\":[],\"items\":[]}}");
        mvc.perform(get("/api/projects").with(as(alice))).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void listReturnsTheIdsOfTheOwnProjects() throws Exception {
        mvc.perform(get("/api/projects").with(as(alice))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        long first = create(alice, "{}"), other = create(bob, "{}"), second = create(alice, "{}");
        mvc.perform(get("/api/projects").with(as(alice))).andExpect(jsonPath("$", contains((int) first, (int) second)));
        mvc.perform(get("/api/projects").with(as(bob))).andExpect(jsonPath("$", contains((int) other)));
        mvc.perform(get("/api/projects").with(as(admin))).andExpect(jsonPath("$", contains((int) first, (int) other, (int) second)));
    }

    @Test
    void deleteRemovesProject() throws Exception {
        long id = create(alice, "{}");
        mvc.perform(delete("/api/projects/" + id).with(as(alice))).andExpect(status().isOk());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(status().isNotFound());
    }

    @Test
    void deleteOfUnknownIdReturnsOk() throws Exception {
        mvc.perform(delete("/api/projects/404").with(as(alice))).andExpect(status().isOk());
    }

    @Test
    void largeProjectRoundTrips() throws Exception {
        String big = "{\"data\":\"" + "x".repeat(300_000) + "\"}";
        long id = create(alice, big);
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(status().isOk()).andExpect(jsonPath("$.data", hasLength(300_000)));
    }

    @Test
    void nameOwnerAndSharingAreListedWithoutTheDocument() throws Exception {
        long first = create(alice, "{\"v\":2}");
        mvc.perform(post("/api/projects").param("name", "Woning Jan").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"v\":1}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/projects/summaries").with(as(alice))).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id", is((int) first)))
                .andExpect(jsonPath("$[0].name").value(nullValue()))
                .andExpect(jsonPath("$[1].name", is("Woning Jan")))
                .andExpect(jsonPath("$[1].updated", notNullValue()))
                .andExpect(jsonPath("$[1].owner.name", is("Alice Test")))
                .andExpect(jsonPath("$[1].groups", hasSize(0)))
                .andExpect(jsonPath("$[1].mine", is(true)))
                .andExpect(jsonPath("$[1].canManage", is(true)))
                .andExpect(jsonPath("$[1].json").doesNotExist());
    }

    @Test
    void theProjectOfSomeoneElseDoesNotExistForYou() throws Exception {
        long id = create(alice, "{\"v\":1}");
        mvc.perform(get("/api/projects/" + id).with(as(bob))).andExpect(status().isNotFound()).andExpect(jsonPath("$.messageKey", is("project.notFound")));
        putProject(bob, id, "{\"v\":666}").andExpect(status().isNotFound());
        mvc.perform(delete("/api/projects/" + id).with(as(bob))).andExpect(status().isNotFound());
        share(bob, id).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/summaries").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(jsonPath("$.v", is(1)));
    }

    @Test
    void aSharedProjectIsOpenedAndSavedByTheGroupButOnlyTheOwnerDeletesOrSharesIt() throws Exception {
        UserGroup team = group("Team", alice, bob);
        long id = create(alice, "{\"v\":1}");
        share(alice, id, team.getId()).andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].name", is("Team")));
        mvc.perform(get("/api/projects/summaries").with(as(bob)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].owner.name", is("Alice Test")))
                .andExpect(jsonPath("$[0].groups[0].id", is(team.getId().intValue())))
                .andExpect(jsonPath("$[0].mine", is(false)))
                .andExpect(jsonPath("$[0].canManage", is(false)));
        putProject(bob, id, "{\"v\":2}").andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(jsonPath("$.v", is(2)));
        mvc.perform(delete("/api/projects/" + id).with(as(bob))).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("project.notOwner")));
        share(bob, id).andExpect(status().isForbidden());
        // somebody outside the group still sees nothing
        mvc.perform(get("/api/projects/" + id).with(as(carol))).andExpect(status().isNotFound());
        // no longer shared
        share(alice, id).andExpect(status().isOk()).andExpect(jsonPath("$.groups", hasSize(0)));
        mvc.perform(get("/api/projects/" + id).with(as(bob))).andExpect(status().isNotFound());
    }

    @Test
    void anOwnerSharesOnlyWithHisOwnGroups() throws Exception {
        UserGroup mine = group("Mijn team", alice), other = group("Ander team", bob, carol);
        long id = create(alice, "{}");
        share(alice, id, other.getId()).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("group.notMember")));
        share(alice, id, 99999L).andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("group.notFound")));
        // the administrator may share with any group; the owner keeps that group when he changes his own
        share(admin, id, other.getId()).andExpect(status().isOk());
        share(alice, id, mine.getId(), other.getId()).andExpect(status().isOk()).andExpect(jsonPath("$.groups", hasSize(2)));
        share(alice, id, mine.getId()).andExpect(status().isOk()).andExpect(jsonPath("$.groups[*].name", contains("Ander team", "Mijn team")));
        mvc.perform(get("/api/projects/" + id).with(as(carol))).andExpect(status().isOk());
    }

    @Test
    void anotherAdministratorSeesOnlyHisOwnProjectsAndThoseSharedWithHisGroups() throws Exception {
        long secret = create(alice, "{\"v\":1}"),
                shared = create(bob, "{\"v\":2}"),
                own = create(otherAdmin, "{\"v\":3}");
        UserGroup team = group("Team", bob, otherAdmin);
        share(bob, shared, team.getId()).andExpect(status().isOk());
        mvc.perform(get("/api/projects/summaries").with(as(otherAdmin)))
                .andExpect(jsonPath("$[*].id", containsInAnyOrder((int) shared, (int) own)))
                .andExpect(jsonPath("$[?(@.id == " + shared + ")].canManage", contains(false)));
        // a project of someone else that is not shared with him does not exist for him: not to open, save, delete or share
        mvc.perform(get("/api/projects/" + secret).with(as(otherAdmin))).andExpect(status().isNotFound());
        putProject(otherAdmin, secret, "{\"v\":9}").andExpect(status().isNotFound());
        mvc.perform(delete("/api/projects/" + secret).with(as(otherAdmin))).andExpect(status().isNotFound());
        share(otherAdmin, secret, team.getId()).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/" + secret).with(as(alice))).andExpect(jsonPath("$.v", is(1)));
        // the shared one he opens and saves (like any member), but only the owner deletes or shares it
        putProject(otherAdmin, shared, "{\"v\":5}").andExpect(status().isNoContent());
        mvc.perform(delete("/api/projects/" + shared).with(as(otherAdmin))).andExpect(status().isForbidden());
        // the Hoofdbeheerder sees all three
        mvc.perform(get("/api/projects/summaries").with(as(admin))).andExpect(jsonPath("$[*].id", containsInAnyOrder((int) secret, (int) shared, (int) own)));
    }

    @Test
    void theAdministratorSeesAndManagesEveryProject() throws Exception {
        long id = create(alice, "{\"v\":1}");
        mvc.perform(get("/api/projects/summaries").with(as(admin)))
                .andExpect(jsonPath("$[0].mine", is(false)))
                .andExpect(jsonPath("$[0].canManage", is(true)));
        putProject(admin, id, "{\"v\":2}").andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(jsonPath("$.v", is(2)));
        mvc.perform(delete("/api/projects/" + id).with(as(admin))).andExpect(status().isOk());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(status().isNotFound());
    }

    @Test
    void theProjectsNeedOneOfOurAccounts() throws Exception {
        // signed in some other way (no account of Plugged): no projects
        mvc.perform(get("/api/projects").with(user("x"))).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.messageKey", is("auth.signInRequired")));
        // an account that has just been removed
        AppUser gone = account(users, "Weg", false);
        users.delete(gone);
        mvc.perform(get("/api/projects").with(as(gone)).with(csrf())).andExpect(status().isUnauthorized());
    }
}
