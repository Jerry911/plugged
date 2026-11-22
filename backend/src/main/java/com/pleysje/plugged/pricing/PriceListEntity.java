// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.pricing;

import com.pleysje.plugged.entity.UserGroup;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A price list of a user (table {@code price_lists}): the articles he buys with their prices, which articles a symbol of the plan is made
 * of, the cover plates per number of places and direction, the labour, margin and VAT, and the details of his company for the offerte.
 * The document is JSON owned by the editor (frontend model/pricing.js), like a project. Its owner edits it; he can share it with groups
 * (table {@code price_list_groups}): their members use it for their offertes and can make a copy of their own.
 */
@Entity
@Table(name = "price_lists")
public class PriceListEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_user_id", nullable = false)
    private long ownerUserId;
    @Column(nullable = false, length = 200)
    private String name;
    @Lob
    @Column(nullable = false, length = 3_000_000)
    private String json;
    @Column(nullable = false)
    private long version;
    @Column(nullable = false, length = 40)
    private String updated;
    @ManyToMany
    @JoinTable(name = "price_list_groups", joinColumns = @JoinColumn(name = "price_list_id"), inverseJoinColumns = @JoinColumn(name = "group_id"))
    private Set<UserGroup> groups = new LinkedHashSet<>();

    protected PriceListEntity() {
    }

    public PriceListEntity(long ownerUserId, String name, String json, String updated) {
        this.ownerUserId = ownerUserId;
        this.name = name;
        this.json = json;
        this.updated = updated;
    }

    public Long getId() { return id; }
    public long getOwnerUserId() { return ownerUserId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getJson() { return json; }
    public void setJson(String json) { this.json = json; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }
    public String getUpdated() { return updated; }
    public void setUpdated(String updated) { this.updated = updated; }
    public Set<UserGroup> getGroups() { return groups; }
}
