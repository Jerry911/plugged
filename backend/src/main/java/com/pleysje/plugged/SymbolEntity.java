// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

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
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

/**
 * A symbol of the catalog: the standard symbols (builtin, seeded from {@link StandardSymbols}, possibly edited by the user)
 * and the symbols the user made. The parents and the shapes are child tables (symbol_parents, symbol_shapes).
 */
@Entity
@Table(name = "symbols")
public class SymbolEntity {
    @Id
    @Column(name = "k", length = 100)
    private String k;
    @Column(nullable = false, length = 120)
    private String name;
    @Column(name = "category", nullable = false, length = 60)
    private String category;
    private boolean place = true;
    /** a standard symbol: cannot be deleted, can be restored */
    private boolean builtin;
    /** a standard symbol that was changed by the user */
    private boolean modified;
    /** the catalog version the standard symbol was taken from (0 for the symbols of the user) */
    @Column(name = "std_version")
    private int stdVersion;
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

    /** socket parameters (see {@link SymbolDto}); sockSet tells whether the symbol has them */
    @Column(name = "sock_set")
    private boolean sockSet;
    private Boolean sockPe, sockKid, sockH;
    private Integer sockN;

    public String getK() { return k; }
    public void setK(String k) { this.k = k; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public boolean isPlace() { return place; }
    public void setPlace(boolean place) { this.place = place; }
    public boolean isBuiltin() { return builtin; }
    public void setBuiltin(boolean builtin) { this.builtin = builtin; }
    public boolean isModified() { return modified; }
    public void setModified(boolean modified) { this.modified = modified; }
    public int getStdVersion() { return stdVersion; }
    public void setStdVersion(int stdVersion) { this.stdVersion = stdVersion; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public List<String> getParents() { return parents; }
    public void setParents(List<String> parents) { this.parents = parents; }
    public List<ShapeRow> getShapes() { return shapes; }
    public void setShapes(List<ShapeRow> shapes) { this.shapes = shapes; }
    public boolean isSockSet() { return sockSet; }
    public void setSockSet(boolean sockSet) { this.sockSet = sockSet; }
    public Boolean getSockPe() { return sockPe; }
    public void setSockPe(Boolean sockPe) { this.sockPe = sockPe; }
    public Boolean getSockKid() { return sockKid; }
    public void setSockKid(Boolean sockKid) { this.sockKid = sockKid; }
    public Boolean getSockH() { return sockH; }
    public void setSockH(Boolean sockH) { this.sockH = sockH; }
    public Integer getSockN() { return sockN; }
    public void setSockN(Integer sockN) { this.sockN = sockN; }

    /** Same drawing and settings (name, category, placement, parents, shapes, socket parameters)? Flags and version are not compared. */
    public boolean sameDefinition(SymbolEntity o) {
        return name.equals(o.name) && category.equals(o.category) && place == o.place && parents.equals(o.parents) && shapes.equals(o.shapes)
                && sockSet == o.sockSet && java.util.Objects.equals(sockPe, o.sockPe) && java.util.Objects.equals(sockKid, o.sockKid)
                && java.util.Objects.equals(sockH, o.sockH) && java.util.Objects.equals(sockN, o.sockN);
    }
}
