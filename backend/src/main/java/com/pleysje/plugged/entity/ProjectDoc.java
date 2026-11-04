// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToMany;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A whole project (tree, plan, footer, custom symbols) stored as one JSON document, with the user who owns it and the groups it is shared with
 * (table {@code project_groups}). The owner and the members of those groups may open and save it; only the owner (or an administrator) may
 * delete it or change the groups.
 */
@Entity
public class ProjectDoc {
    @Id
    private Long id;
    @Lob
    @Column(length = 10_000_000)
    private String json;
    /** Human readable name of the project (null for projects saved before names existed). */
    @Column(length = 255)
    private String name;
    /** Moment of the last save, ISO-8601 (a string, so it sorts and serializes without surprises). */
    @Column(length = 40)
    private String updated;
    /** The id of the user who owns the project (null only for projects saved before accounts existed, until they are given to the admin). */
    private Long ownerId;
    @ManyToMany
    @JoinTable(name = "project_groups", joinColumns = @JoinColumn(name = "project_id"), inverseJoinColumns = @JoinColumn(name = "group_id"))
    private Set<UserGroup> groups = new LinkedHashSet<>();

    public ProjectDoc() {
    }

    public ProjectDoc(Long id, String json) {
        this(id, json, null);
    }

    public ProjectDoc(Long id, String json, String name) {
        this.id = id;
        this.json = json;
        this.name = name;
        this.updated = java.time.Instant.now().toString();
    }

    public Long getId() {
        return id;
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
