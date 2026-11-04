// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;

/**
 * A whole project (tree, plan, footer, custom symbols) stored as one JSON document.
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
}
