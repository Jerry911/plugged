// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Writes the standard symbols as JSON (one symbol per line) without any library. The frontend tests use the result as their
 * symbol library ({@value #FIXTURE}); {@link StandardSymbolsTest} fails when that file no longer matches the catalog.
 * Regenerate with: {@code mvn -q test-compile exec:java -Dexec.classpathScope=test -Dexec.mainClass=com.pleysje.plugged.catalog.StandardSymbolsJson}
 * or simply run this class from the IDE (working directory: backend).
 */
public final class StandardSymbolsJson {
    public static final String FIXTURE = "../frontend/src/test/fixtures/standard-symbols.json";

    private StandardSymbolsJson() {
    }

    public static String json(List<SymbolDto> symbols) {
        StringBuilder out = new StringBuilder("[\n");
        for (int index = 0; index < symbols.size(); index++) {
            out.append("  ");
            writeSymbol(out, symbols.get(index));
            out.append(index < symbols.size() - 1 ? ",\n" : "\n");
        }
        return out.append("]\n").toString();
    }

    /** a symbol with the JSON field names of the API */
    private static void writeSymbol(StringBuilder out, SymbolDto symbol) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("k", symbol.key());
        fields.put("name", symbol.name());
        fields.put("cat", symbol.category());
        fields.put("parents", symbol.parents());
        fields.put("place", symbol.placeable());
        fields.put("shapes", symbol.shapes());
        if (symbol.socket() != null) fields.put("sock", symbol.socket());
        if (Boolean.TRUE.equals(symbol.details())) fields.put("details", true);
        fields.put("v", symbol.version());
        fields.put("builtin", symbol.builtin());
        fields.put("modified", symbol.modified());
        writeValue(out, fields);
    }

    private static void writeValue(StringBuilder out, Object value) {
        if (value == null) out.append("null");
        else if (value instanceof String text) out.append('"').append(text.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
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

    public static void main(String[] arguments) throws IOException {
        Path target = Path.of(arguments.length > 0 ? arguments[0] : FIXTURE);
        Files.createDirectories(target.getParent());
        Files.writeString(target, json(StandardSymbols.all()), StandardCharsets.UTF_8);
        System.out.println("written " + target.toAbsolutePath());
    }
}
