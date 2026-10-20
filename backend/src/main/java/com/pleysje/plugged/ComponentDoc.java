// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;

/**
 * One component of the symbol library (name, category, allowed parents and shapes) stored as a JSON document, keyed by its type key.
 * The library is shared by all projects; the frontend seeds the standard components on first start.
 */
@Entity
public class ComponentDoc {
    @Id
    private String k;
    @Lob
    @Column(length = 1_000_000)
    private String json;

    public ComponentDoc() {
    }

    public ComponentDoc(String k, String json) {
        this.k = k;
        this.json = json;
    }

    public String getK() {
        return k;
    }

    public void setK(String k) {
        this.k = k;
    }

    public String getJson() {
        return json;
    }

    public void setJson(String json) {
        this.json = json;
    }
}
