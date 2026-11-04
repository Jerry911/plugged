// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.catalog.StandardSymbols;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.ShapeRow;
import com.pleysje.plugged.entity.SymbolEntity;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Converts between the entity and the JSON form of a symbol. */
public final class SymbolMapper {
    /** the category of a symbol of the user that has none (stored in Dutch, the frontend translates it) */
    public static final String DEFAULT_CATEGORY = "Eigen";

    private SymbolMapper() {
    }

    /** The definition of a (valid) dto as an entity: flags and version are left for the caller. Missing parents get the default, a missing category "Eigen". */
    public static SymbolEntity toEntity(SymbolDto symbol) {
        SymbolEntity entity = new SymbolEntity();
        entity.setKey(symbol.key());
        entity.setName(symbol.name().trim());
        entity.setCategory(symbol.category() == null || symbol.category().isBlank() ? DEFAULT_CATEGORY : symbol.category().trim());
        entity.setPlaceable(symbol.placeable() == null || symbol.placeable());
        entity.setDetails(Boolean.TRUE.equals(symbol.details()));
        entity.setParents(new ArrayList<>(new LinkedHashSet<>(symbol.parents() == null ? StandardSymbols.ELEMENT_KEYS : symbol.parents())));
        List<ShapeRow> rows = new ArrayList<>();
        for (Map<String, Object> shape : symbol.shapes()) rows.add(ShapeRow.of(shape));
        entity.setShapes(rows);
        Map<String, Object> socket = symbol.socket();
        if (socket != null && !socket.isEmpty()) {
            entity.setSocketSet(true);
            if (socket.containsKey("pe")) entity.setSocketEarthed(Boolean.TRUE.equals(socket.get("pe")));
            if (socket.containsKey("kid")) entity.setSocketChildSafe(Boolean.TRUE.equals(socket.get("kid")));
            if (socket.containsKey("h")) entity.setSocketWaterproof(Boolean.TRUE.equals(socket.get("h")));
            if (socket.get("n") instanceof Number count) entity.setSocketCount(count.intValue());
        }
        return entity;
    }

    public static SymbolDto toDto(SymbolEntity entity) {
        List<Map<String, Object>> shapes = new ArrayList<>();
        for (ShapeRow row : entity.getShapes()) shapes.add(row.toMap());
        Map<String, Object> socket = null;
        if (entity.isSocketSet()) {
            socket = new LinkedHashMap<>();
            if (entity.getSocketEarthed() != null) socket.put("pe", entity.getSocketEarthed());
            if (entity.getSocketChildSafe() != null) socket.put("kid", entity.getSocketChildSafe());
            if (entity.getSocketWaterproof() != null) socket.put("h", entity.getSocketWaterproof());
            if (entity.getSocketCount() != null) socket.put("n", entity.getSocketCount());
        }
        // a standard symbol edited before this option existed has no stored value: it keeps the one of the catalog
        Boolean details = entity.getDetails();
        if (details == null) {
            SymbolDto standard = entity.isBuiltin() ? StandardSymbols.find(entity.getKey()) : null;
            details = standard != null && Boolean.TRUE.equals(standard.details());
        }
        return new SymbolDto(entity.getKey(), entity.getName(), entity.getCategory(), new ArrayList<>(entity.getParents()), entity.isPlaceable(), shapes, socket,
                entity.getStandardVersion(), entity.isBuiltin(), entity.isModified(), details);
    }
}
