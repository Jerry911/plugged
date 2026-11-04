// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The file format of the standard symbols ({@link StandardSymbols#CATALOG}): a JSON list with one symbol per line, with the field names of
 * the API (k, name, cat, parents, place, shapes, and sock and details when they apply). One symbol per line keeps the differences between
 * two releases readable in git. Beheer → Symbolen downloads the catalog in exactly this format.
 */
public final class CatalogJson {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private CatalogJson() {
    }

    /** The symbols of a catalog file (fields that are not in the file are null). */
    public static List<SymbolDto> read(InputStream in) {
        List<SymbolDto> symbols = JSON.readValue(in, new TypeReference<List<SymbolDto>>() {
        });
        return symbols == null ? List.of() : symbols;
    }

    /** The catalog file of these symbols. */
    public static String write(List<SymbolDto> symbols) {
        StringBuilder out = new StringBuilder("[\n");
        for (int index = 0; index < symbols.size(); index++) {
            out.append("  ");
            writeValue(out, fields(symbols.get(index)));
            out.append(index < symbols.size() - 1 ? ",\n" : "\n");
        }
        return out.append("]\n").toString();
    }

    private static Map<String, Object> fields(SymbolDto symbol) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("k", symbol.key());
        fields.put("name", symbol.name());
        fields.put("cat", symbol.category());
        fields.put("parents", symbol.parents());
        fields.put("place", symbol.placeable());
        fields.put("shapes", symbol.shapes());
        if (symbol.socket() != null) fields.put("sock", symbol.socket());
        if (Boolean.TRUE.equals(symbol.details())) fields.put("details", true);
        return fields;
    }

    private static void writeValue(StringBuilder out, Object value) {
        if (value == null) out.append("null");
        else if (value instanceof String text) out.append(JSON.writeValueAsString(text));
        else if (value instanceof Double number) out.append(number == Math.rint(number) && Math.abs(number) < 1e9 ? String.valueOf(number.longValue()) : number.toString());
        else if (value instanceof Number || value instanceof Boolean) out.append(value);
        else if (value instanceof Map<?, ?> map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) out.append(',');
                first = false;
                writeValue(out, String.valueOf(entry.getKey()));
                out.append(':');
                writeValue(out, entry.getValue());
            }
            out.append('}');
        } else if (value instanceof List<?> list) {
            out.append('[');
            for (int index = 0; index < list.size(); index++) {
                if (index > 0) out.append(',');
                writeValue(out, list.get(index));
            }
            out.append(']');
        } else throw new IllegalArgumentException("unsupported " + value.getClass());
    }
}
