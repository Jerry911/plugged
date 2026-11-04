// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;

/**
 * One component of the symbol library (name, category, allowed parents and shapes) stored as a JSON document, keyed by its type key.
 * Legacy: see {@link com.pleysje.plugged.controller.ComponentController}.
 */
@Entity
public class ComponentDoc {
    @Id
    private String componentKey;
    @Lob
    @Column(length = 1_000_000)
    private String json;

    public ComponentDoc() {
    }

    public ComponentDoc(String componentKey, String json) {
        this.componentKey = componentKey;
        this.json = json;
    }

    public String getComponentKey() {
        return componentKey;
    }

    public void setComponentKey(String componentKey) {
        this.componentKey = componentKey;
    }

    public String getJson() {
        return json;
    }

    public void setJson(String json) {
        this.json = json;
    }
}
