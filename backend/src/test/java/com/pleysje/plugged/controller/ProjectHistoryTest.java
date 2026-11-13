// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.service.PresenceService;
import com.pleysje.plugged.service.ProjectService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The history of a project, copies, the trash, and who else has a project open. */
@SpringBootTest(properties = {"plugged.admin.email=admin@example.be", "plugged.project-history=3", "plugged.trash-days=30"})
@AutoConfigureMockMvc
class ProjectHistoryTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;
    @Autowired
    ProjectService service;
    @Autowired
    PresenceService presence;
    @Autowired
    JdbcTemplate jdbc;

    AppUser alice, bob, carol;
    UserGroup team;

    @BeforeEach
    void clean() {
        TestAccounts.clean(groups, projects, users);
        presence.reset();
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
        carol = account(users, "Carol", false);
        team = new UserGroup("Team");
        team.getMembers().addAll(List.of(alice, bob));
        team = groups.save(team);
    }

    private long create(AppUser user, String json) throws Exception {
        String answer = mvc.perform(post("/api/projects").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return Long.parseLong(answer.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }

    private ResultActions save(AppUser user, long id, String json, long basedOn) throws Exception {
        return mvc.perform(put("/api/projects/" + id).with(as(user)).header(HttpHeaders.IF_MATCH, "\"" + basedOn + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void share(long id) throws Exception {
        mvc.perform(put("/api/projects/" + id + "/groups").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"groupIds\":[" + team.getId() + "]}")).andExpect(status().isOk());
    }

    @Test
    void everySaveIsInTheHistoryAndAnOlderVersionCanBeRestored() throws Exception {
        long id = create(alice, "{\"v\":0}");
        share(id);
        save(alice, id, "{\"v\":1}", 0).andExpect(status().isNoContent());
        save(bob, id, "{\"v\":2}", 1).andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id + "/versions").with(as(bob))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].version", contains(2, 1, 0)))
                .andExpect(jsonPath("$[0].savedBy", is("Bob Test"))).andExpect(jsonPath("$[0].current", is(true)))
                .andExpect(jsonPath("$[1].savedBy", is("Alice Test"))).andExpect(jsonPath("$[1].current", is(false)))
                .andExpect(jsonPath("$[0].json").doesNotExist());
        mvc.perform(get("/api/projects/" + id + "/versions/1").with(as(bob))).andExpect(jsonPath("$.v", is(1)));
        mvc.perform(get("/api/projects/" + id + "/versions").with(as(carol))).andExpect(status().isNotFound());
        // restoring version 1 is a new version 3 with that document
        mvc.perform(post("/api/projects/" + id + "/versions/1/restore").with(as(bob))).andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, "\"3\"")).andExpect(jsonPath("$.version", is(3)));
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(jsonPath("$.v", is(1)));
        // only the newest 3 are kept
        mvc.perform(get("/api/projects/" + id + "/versions").with(as(alice))).andExpect(jsonPath("$[*].version", contains(3, 2, 1)));
        mvc.perform(post("/api/projects/" + id + "/versions/0/restore").with(as(alice))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.messageKey", is("project.versionNotFound")));
    }

    @Test
    void aCopyIsANewOwnProjectThatIsNotShared() throws Exception {
        long id = create(alice, "{\"v\":7}");
        share(id);
        String answer = mvc.perform(post("/api/projects/" + id + "/copy").param("name", "Kopie").with(as(bob))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long copy = Long.parseLong(answer.replaceAll(".*\"id\":(\\d+).*", "$1"));
        assertTrue(copy != id);
        mvc.perform(get("/api/projects/" + copy).with(as(bob))).andExpect(jsonPath("$.v", is(7)));
        mvc.perform(get("/api/projects/" + copy).with(as(alice))).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/summaries").with(as(bob))).andExpect(jsonPath("$[?(@.id == " + copy + ")].name", contains("Kopie")))
                .andExpect(jsonPath("$[?(@.id == " + copy + ")].mine", contains(true)));
        mvc.perform(post("/api/projects/" + id + "/copy").with(as(carol))).andExpect(status().isNotFound());
    }

    @Test
    void aStudentOnlyCopiesHisOwnProjects() throws Exception {
        long teachers = create(alice, "{\"v\":1}");
        share(teachers);
        long own = create(bob, "{}");
        team.setEducational(true);
        team.getOwners().add(alice);
        groups.save(team);
        mvc.perform(post("/api/projects/" + teachers + "/copy").with(as(bob))).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.messageKey", is("project.importNotAllowed")));
        mvc.perform(post("/api/projects/" + own + "/copy").with(as(bob))).andExpect(status().isCreated());
    }

    @Test
    void deletingPutsAProjectInTheTrash_fromWhereItComesBackOrIsRemovedForGood() throws Exception {
        long id = create(alice, "{\"v\":1}");
        share(id);
        mvc.perform(delete("/api/projects/" + id).with(as(bob))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/projects/" + id).with(as(alice))).andExpect(status().isOk());
        mvc.perform(get("/api/projects/" + id).with(as(alice))).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/summaries").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        save(alice, id, "{}", 1).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/trash").with(as(alice))).andExpect(jsonPath("$[*].id", contains((int) id)))
                .andExpect(jsonPath("$[0].updated", notNullValue()));
        mvc.perform(get("/api/projects/trash").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/api/projects/" + id + "/untrash").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(post("/api/projects/" + id + "/untrash").with(as(alice))).andExpect(status().isOk()).andExpect(jsonPath("$.id", is((int) id)));
        mvc.perform(get("/api/projects/" + id).with(as(bob))).andExpect(jsonPath("$.v", is(1)));
        // deleting twice is fine; removing for good only from the trash
        mvc.perform(delete("/api/projects/trash/" + id).with(as(alice))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/projects/" + id).with(as(alice))).andExpect(status().isOk());
        mvc.perform(delete("/api/projects/" + id).with(as(alice))).andExpect(status().isOk());
        mvc.perform(delete("/api/projects/trash/" + id).with(as(alice))).andExpect(status().isNoContent());
        assertTrue(projects.findById(id).isEmpty());
        assertTrue(jdbc.queryForObject("select count(*) from project_versions where project_id = ?", Integer.class, id) == 0);
    }

    @Test
    void theTrashEmptiesItselfAfterTheConfiguredDays() throws Exception {
        long old = create(alice, "{}"), recent = create(alice, "{}");
        mvc.perform(delete("/api/projects/" + old).with(as(alice))).andExpect(status().isOk());
        mvc.perform(delete("/api/projects/" + recent).with(as(alice))).andExpect(status().isOk());
        jdbc.update("update project_doc set deleted_at = '2020-01-01T00:00:00Z' where id = ?", old);
        service.purgeExpiredTrash();
        assertTrue(projects.findById(old).isEmpty());
        assertTrue(projects.findById(recent).isPresent());
    }

    @Test
    void theEditorsOfAProjectSeeEachOtherAndTheNewestVersion() throws Exception {
        long id = create(alice, "{}");
        share(id);
        String report = "{\"window\":\"%s\",\"editing\":%s}";
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("w-alice", false)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.others", hasSize(0))).andExpect(jsonPath("$.version", is(0)))
                .andExpect(jsonPath("$.savedBy", is("Alice Test")));
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(bob)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("w-bob", true)))
                .andExpect(jsonPath("$.others[*].name", contains("Alice Test"))).andExpect(jsonPath("$.others[0].editing", is(false)));
        save(bob, id, "{\"v\":1}", 0).andExpect(status().isNoContent());
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("w-alice", false)))
                .andExpect(jsonPath("$.others[*].name", contains("Bob Test"))).andExpect(jsonPath("$.others[0].editing", is(true)))
                .andExpect(jsonPath("$.others[0].me", is(false)))
                .andExpect(jsonPath("$.version", is(1))).andExpect(jsonPath("$.savedBy", is("Bob Test"))).andExpect(jsonPath("$.savedByMe", is(false)));
        mvc.perform(delete("/api/projects/" + id + "/presence").param("window", "w-bob").with(as(bob))).andExpect(status().isNoContent());
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("w-alice", false)))
                .andExpect(jsonPath("$.others", hasSize(0)));
        // somebody who may not open the project learns nothing
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(carol)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("w-carol", false)))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/projects/" + id + "/presence").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(report.formatted("", false)))
                .andExpect(status().isBadRequest());
    }
}
