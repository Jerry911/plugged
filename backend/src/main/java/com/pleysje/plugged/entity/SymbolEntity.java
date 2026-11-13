// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

/**
 * A symbol of the catalog: the standard symbols (builtin, seeded from {@link com.pleysje.plugged.catalog.StandardSymbols}, shared by everyone
 * and changed only by administrators) and the symbols the users made. A symbol of a user belongs either to that user ({@code owner_user_id})
 * or to a group ({@code owner_group_id}): only the user, or the members of the group, see and use it. The parents and the shapes are child tables (symbol_parents, symbol_shapes).
 * The column names are those of the existing databases: they do not follow the Java field names everywhere.
 */
@Entity
@Table(name = "symbols")
public class SymbolEntity {
    @Id
    @Column(name = "k", length = 100)
    private String key;
    @Column(nullable = false, length = 120)
    private String name;
    @Column(name = "category", nullable = false, length = 60)
    private String category;
    @Column(name = "place")
    private boolean placeable = true;
    /** a standard symbol: can be edited, deleted and restored */
    private boolean builtin;
    /** a standard symbol that was changed by the user */
    private boolean modified;
    /** the catalog version the standard symbol was taken from (0 for the symbols of the user) */
    @Column(name = "std_version")
    private int standardVersion;
    @Column(name = "sort_order")
    private int sortOrder;

    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SUBSELECT)
    @CollectionTable(name = "symbol_parents", joinColumns = @JoinColumn(name = "symbol_k"))
    @OrderColumn(name = "pos")
    @Column(name = "parent", length = 100)
    private List<String> parents = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SUBSELECT)
    @CollectionTable(name = "symbol_shapes", joinColumns = @JoinColumn(name = "symbol_k"))
    @OrderColumn(name = "pos")
    private List<ShapeRow> shapes = new ArrayList<>();

    /** the symbol has socket parameters (see {@link com.pleysje.plugged.dto.SymbolDto#socket()}) */
    @Column(name = "sock_set")
    private boolean socketSet;
    /** socket: bar for the protective conductor */
    @Column(name = "sock_pe")
    private Boolean socketEarthed;
    /** socket: child protection */
    @Column(name = "sock_kid")
    private Boolean socketChildSafe;
    /** socket: waterproof */
    @Column(name = "sock_h")
    private Boolean socketWaterproof;
    /** socket: number of sockets */
    @Column(name = "sock_n")
    private Integer socketCount;

    /** the user a personal symbol belongs to (null for standard symbols, hidden rows and group symbols) */
    @Column(name = "owner_user_id")
    private Long ownerUserId;
    /** the group a shared symbol belongs to (null for standard symbols, hidden rows and personal symbols) */
    @Column(name = "owner_group_id")
    private Long ownerGroupId;

    /** the symbol has the extended details input; null = not stored yet (symbols of before this option), see SymbolMapper#toDto */
    @Column(name = "has_details")
    private Boolean details;

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public boolean isPlaceable() { return placeable; }
    public void setPlaceable(boolean placeable) { this.placeable = placeable; }
    public boolean isBuiltin() { return builtin; }
    public void setBuiltin(boolean builtin) { this.builtin = builtin; }
    public boolean isModified() { return modified; }
    public void setModified(boolean modified) { this.modified = modified; }
    public int getStandardVersion() { return standardVersion; }
    public void setStandardVersion(int standardVersion) { this.standardVersion = standardVersion; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public List<String> getParents() { return parents; }
    public void setParents(List<String> parents) { this.parents = parents; }
    public List<ShapeRow> getShapes() { return shapes; }
    public void setShapes(List<ShapeRow> shapes) { this.shapes = shapes; }
    public boolean isSocketSet() { return socketSet; }
    public void setSocketSet(boolean socketSet) { this.socketSet = socketSet; }
    public Boolean getSocketEarthed() { return socketEarthed; }
    public void setSocketEarthed(Boolean socketEarthed) { this.socketEarthed = socketEarthed; }
    public Boolean getSocketChildSafe() { return socketChildSafe; }
    public void setSocketChildSafe(Boolean socketChildSafe) { this.socketChildSafe = socketChildSafe; }
    public Boolean getSocketWaterproof() { return socketWaterproof; }
    public void setSocketWaterproof(Boolean socketWaterproof) { this.socketWaterproof = socketWaterproof; }
    public Integer getSocketCount() { return socketCount; }
    public void setSocketCount(Integer socketCount) { this.socketCount = socketCount; }
    public Boolean getDetails() { return details; }
    public Long getOwnerUserId() { return ownerUserId; }
    public Long getOwnerGroupId() { return ownerGroupId; }

    /** Personal symbol of this user (groupId null) or symbol of this group. */
    public void setOwner(Long userId, Long groupId) {
        this.ownerUserId = groupId == null ? userId : null;
        this.ownerGroupId = groupId;
    }
    public void setDetails(Boolean details) { this.details = details; }

    /** Same drawing and settings (name, category, placement, parents, shapes, socket parameters)? Flags and version are not compared. */
    public boolean sameDefinition(SymbolEntity other) {
        return name.equals(other.name)
                && category.equals(other.category)
                && placeable == other.placeable
                && parents.equals(other.parents)
                && shapes.equals(other.shapes)
                && socketSet == other.socketSet
                && Objects.equals(socketEarthed, other.socketEarthed)
                && Objects.equals(socketChildSafe, other.socketChildSafe)
                && Objects.equals(socketWaterproof, other.socketWaterproof)
                && Objects.equals(socketCount, other.socketCount)
                && Boolean.TRUE.equals(details) == Boolean.TRUE.equals(other.details);
    }
}
