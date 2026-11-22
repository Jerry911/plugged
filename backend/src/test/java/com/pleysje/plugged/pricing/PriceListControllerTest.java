// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.pricing;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The price lists of the offertes: own ones, shared with a group (read-only for the members), versions. */
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class PriceListControllerTest {
    static final JsonMapper JSON = JsonMapper.builder().build();
    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    ProjectRepository projects;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    SymbolRepository symbols;
    @Autowired
    PriceListRepository lists;

    AppUser alice, bob, carol;
    UserGroup firm;

    @BeforeEach
    void clean() {
        lists.deleteAll();
        com.pleysje.plugged.TestAccounts.clean(groups, projects, users, symbols);
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
        carol = account(users, "Carol", false);
        firm = new UserGroup("Firma");
        firm.getMembers().add(alice);
        firm.getMembers().add(bob);
        firm = groups.save(firm);
    }

    /** Other tests remove groups and users: no price list may still point at them. */
    @org.junit.jupiter.api.AfterEach
    void removeLists() {
        lists.deleteAll();
    }

    private long create(AppUser user, String name, String groupIds) throws Exception {
        String body = "{\"name\":\"" + name + "\",\"document\":{\"articles\":[{\"id\":\"socket\",\"price\":\"3,45\"}]},\"groupIds\":" + groupIds + "}";
        return JSON.readTree(mvc.perform(post("/api/price-lists").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
    }

    @Test
    void ownListsAreSharedWithAGroupReadOnlyAndSavedOnTopOfTheirVersion() throws Exception {
        long id = create(alice, "Mijn prijzen", "[" + firm.getId() + "]");
        mvc.perform(get("/api/price-lists/" + id).with(as(alice))).andExpect(status().isOk())
                .andExpect(jsonPath("$.mine").value(true)).andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.document.articles[0].price").value("3,45"));
        // Bob in the group sees and uses it, cannot change it; Carol does not see it
        mvc.perform(get("/api/price-lists").with(as(bob))).andExpect(jsonPath("$[0].mine").value(false)).andExpect(jsonPath("$[0].owner").value(containsString("Alice")));
        mvc.perform(put("/api/price-lists/" + id).with(as(bob)).header("If-Match", "\"0\"").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"document\":{},\"groupIds\":[]}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/price-lists/" + id).with(as(carol))).andExpect(status().isNotFound());
        mvc.perform(get("/api/price-lists").with(as(carol))).andExpect(jsonPath("$", hasSize(0)));
        // saving: on top of the version it was based on
        mvc.perform(put("/api/price-lists/" + id).with(as(alice)).header("If-Match", "\"0\"").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Prijzen 2027\",\"document\":{\"margin\":15},\"groupIds\":[]}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(put("/api/price-lists/" + id).with(as(alice)).header("If-Match", "\"0\"").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Oud\",\"document\":{},\"groupIds\":[]}")).andExpect(status().isConflict());
        // no longer shared
        mvc.perform(get("/api/price-lists/" + id).with(as(bob))).andExpect(status().isNotFound());
    }

    @Test
    void onlyOwnGroupsANameAndADocumentAndOnlyTheOwnerRemovesIt() throws Exception {
        UserGroup other = groups.save(new UserGroup("Andere"));
        mvc.perform(post("/api/price-lists").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"document\":{},\"groupIds\":[" + other.getId() + "]}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/price-lists").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\" \",\"document\":{},\"groupIds\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/price-lists").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"document\":[1],\"groupIds\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/price-lists/groups").with(as(alice))).andExpect(jsonPath("$[*].name", contains("Firma")));
        long id = create(alice, "Weg", "[" + firm.getId() + "]");
        mvc.perform(delete("/api/price-lists/" + id).with(as(bob))).andExpect(status().isForbidden());
        // a group that goes is no longer shared with
        mvc.perform(delete("/api/admin/groups/" + firm.getId()).with(as(account(users, "Admin", true)))).andExpect(status().is2xxSuccessful());
        mvc.perform(get("/api/price-lists").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(delete("/api/price-lists/" + id).with(as(alice))).andExpect(status().isNoContent());
        mvc.perform(get("/api/price-lists").with(as(alice))).andExpect(jsonPath("$", hasSize(0)));
    }
}
