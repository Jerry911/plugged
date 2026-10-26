// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Converts between the entity and the JSON form of a symbol. */
public final class SymbolMapper {
    public static final String DEFAULT_CATEGORY = "Eigen";

    private SymbolMapper() {
    }

    /** The definition of a (valid) dto as an entity: flags and version are left for the caller. Missing parents get the default, a missing category "Eigen". */
    public static SymbolEntity toEntity(SymbolDto d) {
        SymbolEntity e = new SymbolEntity();
        e.setK(d.k());
        e.setName(d.name().trim());
        e.setCategory(d.cat() == null || d.cat().isBlank() ? DEFAULT_CATEGORY : d.cat().trim());
        e.setPlace(d.place() == null || d.place());
        e.setDetails(Boolean.TRUE.equals(d.details()));
        e.setParents(new ArrayList<>(new LinkedHashSet<>(d.parents() == null ? StandardSymbols.ELEMENT_KEYS : d.parents())));
        List<ShapeRow> rows = new ArrayList<>();
        for (Map<String, Object> m : d.shapes()) rows.add(ShapeRow.of(m));
        e.setShapes(rows);
        Map<String, Object> sock = d.sock();
        if (sock != null && !sock.isEmpty()) {
            e.setSockSet(true);
            if (sock.containsKey("pe")) e.setSockPe(Boolean.TRUE.equals(sock.get("pe")));
            if (sock.containsKey("kid")) e.setSockKid(Boolean.TRUE.equals(sock.get("kid")));
            if (sock.containsKey("h")) e.setSockH(Boolean.TRUE.equals(sock.get("h")));
            if (sock.get("n") instanceof Number n) e.setSockN(n.intValue());
        }
        return e;
    }

    public static SymbolDto toDto(SymbolEntity e) {
        List<Map<String, Object>> shapes = new ArrayList<>();
        for (ShapeRow r : e.getShapes()) shapes.add(r.toMap());
        Map<String, Object> sock = null;
        if (e.isSockSet()) {
            sock = new LinkedHashMap<>();
            if (e.getSockPe() != null) sock.put("pe", e.getSockPe());
            if (e.getSockKid() != null) sock.put("kid", e.getSockKid());
            if (e.getSockH() != null) sock.put("h", e.getSockH());
            if (e.getSockN() != null) sock.put("n", e.getSockN());
        }
        // a standard symbol edited before this option existed has no stored value: it keeps the one of the catalog
        Boolean details = e.getDetails();
        if (details == null) details = e.isBuiltin() && StandardSymbols.find(e.getK()) != null && Boolean.TRUE.equals(StandardSymbols.find(e.getK()).details());
        return new SymbolDto(e.getK(), e.getName(), e.getCategory(), new ArrayList<>(e.getParents()), e.isPlace(), shapes, sock,
                e.getStdVersion(), e.isBuiltin(), e.isModified(), details);
    }
}
