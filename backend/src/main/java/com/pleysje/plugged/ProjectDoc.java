// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

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

    public ProjectDoc() {
    }

    public ProjectDoc(Long id, String json) {
        this.id = id;
        this.json = json;
    }

    public Long getId() {
        return id;
    }

    public String getJson() {
        return json;
    }

    public void setJson(String j) {
        json = j;
    }
}
