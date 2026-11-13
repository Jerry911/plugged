// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Version;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.OptimisticLock;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A whole project (tree, plan, footer, custom symbols) stored as one JSON document, with the user who owns it and the groups it is shared with
 * (table {@code project_groups}). The owner and the members of those groups may open and save it; only the owner (or an administrator) may
 * delete it or change the groups.
 * <p>
 * The <b>number</b> comes from the database sequence {@code project_doc_seq} (never from the client; ProjectIds keeps the sequence ahead
 * of the numbers of older databases). The <b>version</b> goes up with every save: a save based on an older version is refused (409), so two
 * people with the same project open do not overwrite each other's work without noticing.
 */
@Entity
public class ProjectDoc {
    public static final String ID_SEQUENCE = "project_doc_seq";

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "project_ids")
    @SequenceGenerator(name = "project_ids", sequenceName = ID_SEQUENCE, allocationSize = 1)
    private Long id;
    /** Optimistic locking; the column default gives the projects of an existing database version 0. */
    @Version
    @ColumnDefault("0")
    @Column(nullable = false)
    private long version;
    @Lob
    @Column(length = 10_000_000)
    private String json;
    /** Human readable name of the project (null for projects saved before names existed). */
    @Column(length = 255)
    private String name;
    /** Moment of the last save, ISO-8601 (a string, so it sorts and serializes without surprises). */
    @Column(length = 40)
    private String updated;
    /** In the trash since this moment (ISO-8601), null = not deleted. A project in the trash is not listed, opened or saved. */
    @Column(length = 40)
    private String deletedAt;
    /** Who put it in the trash. */
    private Long deletedBy;
    /** The id of the user who owns the project (null only for projects saved before accounts existed, until they are given to the admin). */
    private Long ownerId;
    /** Sharing is no new version of the document: an editor that has the project open can still save it. */
    @OptimisticLock(excluded = true)
    @ManyToMany
    @JoinTable(name = "project_groups", joinColumns = @JoinColumn(name = "project_id"), inverseJoinColumns = @JoinColumn(name = "group_id"))
    private Set<UserGroup> groups = new LinkedHashSet<>();

    public ProjectDoc() {
    }

    public ProjectDoc(String json) {
        this(json, null);
    }

    public ProjectDoc(String json, String name) {
        this.json = json;
        this.name = name;
        this.updated = java.time.Instant.now().toString();
    }

    public Long getId() {
        return id;
    }

    public long getVersion() {
        return version;
    }

    public String getJson() {
        return json;
    }

    public void setJson(String json) {
        this.json = json;
    }

    public String getName() {
        return name;
    }

    public String getDeletedAt() {
        return deletedAt;
    }

    public Long getDeletedBy() {
        return deletedBy;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /** Into the trash (by {@code userId}), or out of it again ({@code userId} null). */
    public void trash(Long userId) {
        deletedAt = userId == null ? null : java.time.Instant.now().toString();
        deletedBy = userId;
    }

    public String getUpdated() {
        return updated;
    }

    /** A new save: the document, its name and the moment. Owner and groups stay. */
    public void update(String json, String name) {
        this.json = json;
        this.name = name;
        this.updated = java.time.Instant.now().toString();
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(Long ownerId) {
        this.ownerId = ownerId;
    }

    public Set<UserGroup> getGroups() {
        return groups;
    }
}
