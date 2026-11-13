// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.SymbolEntity;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.UserService;
import com.pleysje.plugged.service.SymbolService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Who sees and changes which symbols: the standard catalog (administrators), personal symbols and the symbols of a group. */
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class SymbolAccessTest {
    private static final String BOX = "{\"t\":\"rect\",\"x\":2,\"y\":2,\"w\":10,\"h\":8}";

    @Autowired
    MockMvc mvc;
    @Autowired
    SymbolRepository symbols;
    @Autowired
    SymbolService service;
    @Autowired
    UserService userService;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;

    AppUser admin, alice, bob, carol;
    UserGroup team;

    @BeforeEach
    void reset() {
        symbols.deleteAll();
        service.seed();
        TestAccounts.clean(groups, projects, users);
        admin = account(users, "Admin", true);
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
        carol = account(users, "Carol", false);
        team = new UserGroup("Team");
        team.getMembers().addAll(List.of(alice, bob));
        team = groups.save(team);
    }

    private static String symbol(String key, String name, Long group) {
        return "{\"k\":\"" + key + "\",\"name\":\"" + name + "\",\"cat\":\"Eigen\",\"parents\":[\"kring\"],\"place\":true,\"shapes\":[" + BOX + "]"
                + (group == null ? "" : ",\"group\":" + group) + "}";
    }

    private ResultActions save(AppUser user, String key, String name, Long group) throws Exception {
        return mvc.perform(put("/api/symbols/" + key).with(as(user)).contentType(MediaType.APPLICATION_JSON).content(symbol(key, name, group)));
    }

    private ResultActions list(AppUser user) throws Exception {
        return mvc.perform(get("/api/symbols").with(as(user)));
    }

    @Test
    void aPersonalSymbolIsOnlyThereForItsOwner() throws Exception {
        save(alice, "custom:a", "Van Alice", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.group").value(nullValue())).andExpect(jsonPath("$.editable", is(true)));
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:a')]", hasSize(1)));
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:a')]", hasSize(0)));
        mvc.perform(get("/api/symbols/custom:a").with(as(bob))).andExpect(status().isNotFound());
        // the key of somebody else cannot be taken over, nor deleted
        save(bob, "custom:a", "Overgenomen", null).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/custom:a").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(get("/api/symbols/custom:a").with(as(alice))).andExpect(jsonPath("$.name", is("Van Alice")));
        assertEquals(alice.getId(), symbols.findById("custom:a").orElseThrow().getOwnerUserId());
    }

    @Test
    void aGroupSymbolIsSharedByTheMembers() throws Exception {
        mvc.perform(get("/api/symbols/groups").with(as(alice))).andExpect(jsonPath("$[*].name", contains("Team")));
        mvc.perform(get("/api/symbols/groups").with(as(carol))).andExpect(jsonPath("$", hasSize(0)));
        save(alice, "custom:t", "Van het team", team.getId()).andExpect(status().isOk()).andExpect(jsonPath("$.group", is(team.getId().intValue())));
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:t')].editable", contains(true)));
        list(carol).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(0)));
        save(bob, "custom:t", "Door Bob verbeterd", team.getId()).andExpect(status().isOk());
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:t')].name", contains("Door Bob verbeterd")));
        // somebody outside the group cannot put symbols in it
        save(carol, "custom:c", "Indringer", team.getId()).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.groupNotAllowed")));
        mvc.perform(delete("/api/symbols/custom:t").with(as(carol))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/custom:t").with(as(bob))).andExpect(status().isNoContent());
    }

    @Test
    void aStudentUsesTheSymbolsOfHisGroupButDoesNotChangeThem() throws Exception {
        save(alice, "custom:t", "Van het team", team.getId()).andExpect(status().isOk());
        UserGroup klas = new UserGroup("Klas");
        klas.getMembers().add(bob);
        klas.setEducational(true);
        groups.save(klas);
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:t')].editable", contains(false)));
        save(bob, "custom:t", "Student", team.getId()).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.notEditable")));
        mvc.perform(delete("/api/symbols/custom:t").with(as(bob))).andExpect(status().isForbidden());
        mvc.perform(get("/api/symbols/groups").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        // his own symbols he still makes
        save(bob, "custom:b", "Eigen van Bob", null).andExpect(status().isOk());
    }

    @Test
    void onlyAnAdministratorChangesTheStandardSymbols() throws Exception {
        list(alice).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].editable", contains(false)));
        list(admin).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].editable", contains(true)));
        String edited = symbol("lichtpunt", "Mijn lamp", null);
        mvc.perform(put("/api/symbols/lichtpunt").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(edited))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.standardAdminOnly")));
        mvc.perform(delete("/api/symbols/lichtpunt").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/lichtpunt/restore").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/lichtpunt/standard").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/restore").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(get("/api/symbols/lichtpunt").with(as(alice))).andExpect(jsonPath("$.modified", is(false)));
        mvc.perform(put("/api/symbols/lichtpunt").with(as(admin)).contentType(MediaType.APPLICATION_JSON).content(edited))
                .andExpect(status().isOk()).andExpect(jsonPath("$.modified", is(true)));
        // everybody sees the change of the administrator
        list(bob).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].name", contains("Mijn lamp")));
    }

    @Test
    void anAdministratorPutsSymbolsInAnyGroup() throws Exception {
        save(admin, "custom:x", "Voor het team", team.getId()).andExpect(status().isOk());
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:x')]", hasSize(1)));
    }

    @Test
    void theSymbolsOfARemovedAccountOrGroupGoToTheAdministrator() throws Exception {
        save(carol, "custom:c", "Van Carol", null).andExpect(status().isOk());
        save(alice, "custom:t", "Van het team", team.getId()).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/users/" + carol.getId()).with(as(admin))).andExpect(status().isNoContent());
        assertEquals(admin.getId(), symbols.findById("custom:c").orElseThrow().getOwnerUserId());
        mvc.perform(delete("/api/admin/groups/" + team.getId()).with(as(admin))).andExpect(status().isNoContent());
        SymbolEntity former = symbols.findById("custom:t").orElseThrow();
        assertEquals(admin.getId(), former.getOwnerUserId());
        assertNull(former.getOwnerGroupId());
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(0)));
        list(admin).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(1)));
    }

    @Test
    void ownSymbolsFromBeforeOwnersBelongToThePrimaryAdministrator() throws Exception {
        SymbolEntity old = new SymbolEntity();
        old.setKey("custom:oud");
        old.setName("Oud");
        old.setCategory("Eigen");
        old.setSortOrder(100_000);
        symbols.save(old);
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:oud')]", hasSize(0)));
        userService.claimOwnerlessWork();
        assertEquals(admin.getId(), symbols.findById("custom:oud").orElseThrow().getOwnerUserId());
        // the hidden rows of the standard catalog stay without owner
        mvc.perform(delete("/api/symbols/motor").with(as(admin))).andExpect(status().isNoContent());
        userService.claimOwnerlessWork();
        assertNull(symbols.findById("del:motor").orElseThrow().getOwnerUserId());
    }
}
