// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.pricing;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.service.GroupService;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The price lists of the offertes: a user sees his own ones and those shared with his groups; only the owner changes, shares or removes
 * one (the others can copy it). A save names the version it was based on and is refused when the list changed since (409).
 */
@Service
public class PriceListService {
    private static final Logger log = LoggerFactory.getLogger(PriceListService.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    static final int MAX_LISTS_PER_USER = 50, MAX_NAME_LENGTH = 200;

    /** One price list in the list: {id, name, mine, owner, groups, updated}. */
    public record Summary(long id, String name, boolean mine, String owner, List<ProjectSummary.Ref> groups, String updated) {
    }

    /** A whole price list: the summary fields, its version and its document. */
    public record Full(long id, String name, boolean mine, String owner, List<ProjectSummary.Ref> groups, String updated, long version, JsonNode document) {
    }

    /** What the editor sends: {name, document, groupIds}. */
    public record Save(String name, JsonNode document, List<Long> groupIds) {
    }

    private final PriceListRepository lists;
    private final UserRepository users;
    private final UserGroupRepository groups;
    private final GroupService groupService;

    public PriceListService(PriceListRepository lists, UserRepository users, UserGroupRepository groups, GroupService groupService) {
        this.lists = lists;
        this.users = users;
        this.groups = groups;
        this.groupService = groupService;
    }

    @Transactional(readOnly = true)
    public List<Summary> list(long userId) {
        return lists.visibleTo(userId).stream().map(list -> summary(list, userId)).toList();
    }

    @Transactional(readOnly = true)
    public Full get(long userId, long id) {
        PriceListEntity list = visible(userId, id);
        Summary summary = summary(list, userId);
        return new Full(summary.id(), summary.name(), summary.mine(), summary.owner(), summary.groups(), summary.updated(), list.getVersion(), JSON.readTree(list.getJson()));
    }

    @Transactional
    public Full create(long userId, Save save) {
        if (lists.findByOwnerUserId(userId).size() >= MAX_LISTS_PER_USER) throw new LocalizedStatusException(HttpStatus.CONFLICT, "priceList.tooMany", MAX_LISTS_PER_USER);
        PriceListEntity list = new PriceListEntity(userId, name(save), document(save), Instant.now().toString());
        list.getGroups().addAll(sharing(userId, save.groupIds()));
        list = lists.save(list);
        log.info("User {} made price list {}", userId, list.getId());
        return get(userId, list.getId());
    }

    @Transactional
    public Full save(long userId, long id, long version, Save save) {
        PriceListEntity list = own(userId, id);
        if (list.getVersion() != version) throw new LocalizedStatusException(HttpStatus.CONFLICT, "priceList.changed");
        list.setName(name(save));
        list.setJson(document(save));
        list.setVersion(version + 1);
        list.setUpdated(Instant.now().toString());
        list.getGroups().clear();
        list.getGroups().addAll(sharing(userId, save.groupIds()));
        return get(userId, id);
    }

    @Transactional
    public void delete(long userId, long id) {
        lists.delete(own(userId, id));
        log.info("User {} removed price list {}", userId, id);
    }

    /** The groups the user can share a price list with: his own groups (none for a student in educational mode). */
    @Transactional(readOnly = true)
    public List<ProjectSummary.Ref> groupsFor(long userId) {
        AppUser user = user(userId);
        if (groupService.isRestricted(user)) return List.of();
        return groups.findByMembers_IdOrderByNameAsc(userId).stream().map(group -> new ProjectSummary.Ref(group.getId(), group.getName())).toList();
    }

    private Set<UserGroup> sharing(long userId, List<Long> requested) {
        Set<Long> allowed = groupsFor(userId).stream().map(ProjectSummary.Ref::id).collect(Collectors.toSet());
        Set<UserGroup> result = new LinkedHashSet<>();
        for (Long groupId : requested == null ? List.<Long>of() : requested) {
            if (!allowed.contains(groupId)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "priceList.groupNotAllowed");
            groups.findById(groupId).ifPresent(result::add);
        }
        return result;
    }

    private Summary summary(PriceListEntity list, long userId) {
        boolean mine = list.getOwnerUserId() == userId;
        String owner = mine ? null : users.findById(list.getOwnerUserId()).map(user -> user.getName() + " " + user.getSurname()).orElse("");
        List<ProjectSummary.Ref> shared = list.getGroups().stream().map(group -> new ProjectSummary.Ref(group.getId(), group.getName())).toList();
        return new Summary(list.getId(), list.getName(), mine, owner, shared, list.getUpdated());
    }

    private PriceListEntity visible(long userId, long id) {
        PriceListEntity list = lists.findById(id).orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "priceList.notFound"));
        boolean member = list.getGroups().stream().anyMatch(group -> group.getMembers().stream().anyMatch(member1 -> member1.getId() == userId));
        if (list.getOwnerUserId() != userId && !member) throw new LocalizedStatusException(HttpStatus.NOT_FOUND, "priceList.notFound");
        return list;
    }

    private PriceListEntity own(long userId, long id) {
        PriceListEntity list = visible(userId, id);
        if (list.getOwnerUserId() != userId) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "priceList.notOwner");
        return list;
    }

    private static String name(Save save) {
        String name = save.name() == null ? "" : save.name().strip().replaceAll("\\p{Cntrl}", " ");
        if (name.isEmpty()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "priceList.nameRequired");
        return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH) : name;
    }

    private static String document(Save save) {
        if (save.document() == null || !save.document().isObject()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "priceList.invalid");
        return JSON.writeValueAsString(save.document());
    }

    private AppUser user(long userId) {
        return users.findById(userId).orElseThrow(() -> new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.signInRequired"));
    }
}
