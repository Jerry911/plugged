// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.entity.SymbolEntity;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.UserService;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The rights of a user over his own data (GDPR): a copy of everything that is stored about him and by him ({@link #export}), and removing
 * his account with it ({@link #deleteAccount}).
 */
@Service
public class AccountService {
    private static final Logger log = LoggerFactory.getLogger(AccountService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final UserRepository users;
    private final UserService userService;
    private final UserGroupRepository groups;
    private final ProjectRepository projects;
    private final ProjectService projectService;
    private final SymbolRepository symbols;

    public AccountService(UserRepository users, UserService userService, UserGroupRepository groups, ProjectRepository projects,
                          ProjectService projectService, SymbolRepository symbols) {
        this.users = users;
        this.userService = userService;
        this.groups = groups;
        this.projects = projects;
        this.projectService = projectService;
        this.symbols = symbols;
    }

    private AppUser user(long userId) {
        return users.findById(userId).orElseThrow(() -> new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.signInRequired"));
    }

    /**
     * Everything stored about and by the user, as one JSON document: his account (not the password), his groups, his projects (also those in
     * the trash, with their documents; not their history) and his own symbols. Projects of others that are shared with him are not his: they
     * are not in it.
     */
    @Transactional(readOnly = true)
    public String export(long userId) {
        AppUser user = user(userId);
        ObjectNode out = JSON.createObjectNode();
        out.put("exportedAt", Instant.now().toString());
        out.put("application", "Plugged");
        ObjectNode account = out.putObject("account");
        account.put("name", user.getName());
        account.put("surname", user.getSurname());
        account.put("email", user.getEmail());
        account.put("created", user.getCreated());
        account.put("lastLogin", user.getLastLogin());
        account.put("loginCount", user.getLoginCount());
        account.put("admin", user.isAdmin());
        account.put("approved", user.isApproved());
        ArrayNode groupList = out.putArray("groups");
        for (UserGroup group : groups.findByMembers_IdOrderByNameAsc(userId)) {
            ObjectNode node = groupList.addObject();
            node.put("name", group.getName());
            node.put("owner", group.isOwner(userId));
            node.put("educational", group.isEducational());
        }
        ArrayNode projectList = out.putArray("projects");
        for (Long id : projects.idsOwnedBy(userId)) {
            ProjectDoc project = projects.findById(id).orElse(null);
            if (project == null) continue;
            ObjectNode node = projectList.addObject();
            node.put("number", project.getId());
            node.put("name", project.getName());
            node.put("updated", project.getUpdated());
            if (project.isDeleted()) node.put("inTrashSince", project.getDeletedAt());
            ArrayNode shared = node.putArray("sharedWith");
            project.getGroups().forEach(group -> shared.add(group.getName()));
            node.set("document", JSON.readTree(project.getJson()));
        }
        ArrayNode symbolList = out.putArray("symbols");
        for (SymbolEntity symbol : symbols.findByOwnerUserId(userId)) {
            ObjectNode node = (ObjectNode) JSON.valueToTree(SymbolMapper.toDto(symbol));
            ArrayNode shared = node.putArray("sharedWith");
            symbol.getGroups().forEach(group -> shared.add(group.getName()));
            symbolList.add(node);
        }
        log.info("User {} exported his data ({} project(s), {} symbol(s))", userId, projectList.size(), symbolList.size());
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out);
    }

    /**
     * Removes the account of the signed-in user, confirmed with his password, and everything that is his: his projects (also those he
     * shared and those in the trash, with their history), his own symbols (projects that use them keep their copy) and his place in groups.
     * The primary administrator cannot leave (409): the installation needs him.
     */
    @Transactional
    public void deleteAccount(long userId, String password) {
        AppUser user = user(userId);
        if (!userService.passwordMatches(user, password)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "auth.currentPasswordWrong");
        if (userService.isPrimaryAdmin(user)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "account.primaryCannotLeave");
        List<Long> owned = projects.idsOwnedBy(userId);
        projectService.remove(owned);
        List<SymbolEntity> ownSymbols = symbols.findByOwnerUserId(userId);
        symbols.deleteAll(ownSymbols);
        groups.removeOwnerEverywhere(userId);
        groups.removeMemberEverywhere(userId);
        users.delete(user);
        log.info("User {} removed his account ({} project(s), {} symbol(s) removed)", userId, owned.size(), ownSymbols.size());
    }
}
