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
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

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

    private static String symbol(String key, String name, Long... groups) {
        StringBuilder shared = new StringBuilder();
        for (Long group : groups) shared.append(shared.isEmpty() ? "" : ",").append("{\"id\":").append(group).append("}");
        return "{\"k\":\"" + key + "\",\"name\":\"" + name + "\",\"cat\":\"Eigen\",\"parents\":[\"kring\"],\"place\":true,\"shapes\":[" + BOX + "]"
                + ",\"groups\":[" + shared + "]}";
    }

    private ResultActions save(AppUser user, String key, String name, Long... groups) throws Exception {
        return mvc.perform(put("/api/symbols/" + key).with(as(user)).contentType(MediaType.APPLICATION_JSON).content(symbol(key, name, groups)));
    }

    private ResultActions list(AppUser user) throws Exception {
        return mvc.perform(get("/api/symbols").with(as(user)));
    }

    @Test
    void anOwnSymbolThatIsNotSharedIsOnlyThereForItsOwner() throws Exception {
        save(alice, "custom:a", "Van Alice").andExpect(status().isOk())
                .andExpect(jsonPath("$.groups", hasSize(0))).andExpect(jsonPath("$.editable", is(true)))
                .andExpect(jsonPath("$.shareable", is(true))).andExpect(jsonPath("$.owner", is("Alice Test")));
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:a')]", hasSize(1)));
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:a')]", hasSize(0)));
        mvc.perform(get("/api/symbols/custom:a").with(as(bob))).andExpect(status().isNotFound());
        // the key of somebody else cannot be taken over, nor deleted
        save(bob, "custom:a", "Overgenomen").andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/custom:a").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(get("/api/symbols/custom:a").with(as(alice))).andExpect(jsonPath("$.name", is("Van Alice")));
        assertEquals(alice.getId(), symbols.findById("custom:a").orElseThrow().getOwnerUserId());
    }

    @Test
    void aSymbolIsSharedWithSeveralGroupsOfItsOwner() throws Exception {
        UserGroup club = new UserGroup("Club");
        club.getMembers().addAll(List.of(alice, carol));
        club = groups.save(club);
        mvc.perform(get("/api/symbols/groups").with(as(alice))).andExpect(jsonPath("$[*].name", contains("Club", "Team")));
        mvc.perform(get("/api/symbols/groups").with(as(carol))).andExpect(jsonPath("$[*].name", contains("Club")));
        save(alice, "custom:t", "Gedeeld", team.getId(), club.getId()).andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[*].name", contains("Club", "Team")));
        // Bob (Team) and Carol (Club) both use it and may improve the drawing, but not share or delete it
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:t')].editable", contains(true)))
                .andExpect(jsonPath("$[?(@.k == 'custom:t')].shareable", contains(false)))
                .andExpect(jsonPath("$[?(@.k == 'custom:t')].owner", contains("Alice Test")));
        list(carol).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(1)));
        save(bob, "custom:t", "Door Bob verbeterd").andExpect(status().isOk());
        // Bob sent no groups: he cannot change them, so the sharing stays
        list(carol).andExpect(jsonPath("$[?(@.k == 'custom:t')].name", contains("Door Bob verbeterd")));
        mvc.perform(delete("/api/symbols/custom:t").with(as(bob))).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.messageKey", is("symbol.ownerOnly")));
        // Alice stops sharing it with the club
        save(alice, "custom:t", "Gedeeld", team.getId()).andExpect(status().isOk()).andExpect(jsonPath("$.groups[*].name", contains("Team")));
        list(carol).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(0)));
        mvc.perform(delete("/api/symbols/custom:t").with(as(alice))).andExpect(status().isNoContent());
    }

    @Test
    void onlyGroupsOfTheOwnerCanBeChosen() throws Exception {
        save(carol, "custom:c", "Indringer", team.getId()).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.groupNotAllowed")));
        save(alice, "custom:x", "Onbekende groep", 999_999L).andExpect(status().isForbidden());
        // a group the owner left keeps the symbol until he takes it away there, which he no longer can
        save(alice, "custom:a", "Van Alice", team.getId()).andExpect(status().isOk());
        team.getMembers().remove(alice);
        team = groups.save(team);
        save(alice, "custom:a", "Van Alice, nieuw").andExpect(status().isOk()).andExpect(jsonPath("$.groups[*].name", contains("Team")));
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:a')].name", contains("Van Alice, nieuw")));
    }

    @Test
    void aStudentUsesTheSharedSymbolsButDoesNotChangeOrShareThem() throws Exception {
        save(alice, "custom:t", "Van het team", team.getId()).andExpect(status().isOk());
        UserGroup klas = new UserGroup("Klas");
        klas.getMembers().add(bob);
        klas.setEducational(true);
        groups.save(klas);
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:t')].editable", contains(false)));
        save(bob, "custom:t", "Student").andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.notEditable")));
        mvc.perform(delete("/api/symbols/custom:t").with(as(bob))).andExpect(status().isForbidden());
        mvc.perform(get("/api/symbols/groups").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        // his own symbols he still makes, but he shares them with nobody
        save(bob, "custom:b", "Eigen van Bob").andExpect(status().isOk());
        save(bob, "custom:b2", "Gedeeld door Bob", team.getId()).andExpect(status().isForbidden());
    }

    @Test
    void onlyAnAdministratorChangesTheStandardSymbols() throws Exception {
        list(alice).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].editable", contains(false)));
        list(admin).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].editable", contains(true)));
        String edited = symbol("lichtpunt", "Mijn lamp");
        mvc.perform(put("/api/symbols/lichtpunt").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(edited))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("symbol.standardAdminOnly")));
        mvc.perform(delete("/api/symbols/lichtpunt").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/lichtpunt/restore").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/lichtpunt/standard").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(post("/api/symbols/restore").with(as(alice))).andExpect(status().isForbidden());
        mvc.perform(get("/api/symbols/lichtpunt").with(as(alice))).andExpect(jsonPath("$.modified", is(false)));
        mvc.perform(put("/api/symbols/lichtpunt").with(as(admin)).contentType(MediaType.APPLICATION_JSON).content(edited))
                .andExpect(status().isOk()).andExpect(jsonPath("$.modified", is(true))).andExpect(jsonPath("$.groups").value(nullValue()));
        // everybody sees the change of the administrator
        list(bob).andExpect(jsonPath("$[?(@.k == 'lichtpunt')].name", contains("Mijn lamp")));
    }

    @Test
    void anAdministratorSharesWithAnyGroupAndManagesSharedSymbols() throws Exception {
        save(admin, "custom:x", "Voor het team", team.getId()).andExpect(status().isOk());
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:x')]", hasSize(1)));
        save(alice, "custom:t", "Van Alice", team.getId()).andExpect(status().isOk());
        list(admin).andExpect(jsonPath("$[?(@.k == 'custom:t')].shareable", contains(true)));
        mvc.perform(delete("/api/symbols/custom:t").with(as(admin))).andExpect(status().isNoContent());
    }

    @Test
    void aRemovedGroupNoLongerSharesItsSymbols_aRemovedAccountsSymbolsGoToTheAdministrator() throws Exception {
        save(carol, "custom:c", "Van Carol").andExpect(status().isOk());
        save(alice, "custom:t", "Van Alice", team.getId()).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/users/" + carol.getId()).with(as(admin))).andExpect(status().isNoContent());
        assertEquals(admin.getId(), symbols.findById("custom:c").orElseThrow().getOwnerUserId());
        mvc.perform(delete("/api/admin/groups/" + team.getId()).with(as(admin))).andExpect(status().isNoContent());
        assertEquals(alice.getId(), symbols.findById("custom:t").orElseThrow().getOwnerUserId());
        list(alice).andExpect(jsonPath("$[?(@.k == 'custom:t')].groups", contains(empty())));
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:t')]", hasSize(0)));
    }

    @Test
    void aSymbolOfTheTestVersionThatBelongedToOneGroupIsSharedWithThatGroup() throws Exception {
        save(alice, "custom:g", "Van de groep").andExpect(status().isOk());
        jdbc.update("update symbols set owner_user_id = null, owner_group_id = ? where k = 'custom:g'", team.getId());
        service.migrateGroupOwners();
        userService.claimOwnerlessWork();
        SymbolEntity migrated = symbols.findById("custom:g").orElseThrow();
        assertNull(migrated.getLegacyOwnerGroupId());
        assertEquals(admin.getId(), migrated.getOwnerUserId());
        list(bob).andExpect(jsonPath("$[?(@.k == 'custom:g')].owner", contains("Admin Test")));
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
