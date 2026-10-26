// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Writes the standard symbols as JSON (one symbol per line) without any library. The frontend tests use the result as their
 * symbol library ({@value #FIXTURE}); {@link StandardSymbolsTest} fails when that file no longer matches the catalog.
 * Regenerate with: {@code mvn -q test-compile exec:java -Dexec.classpathScope=test -Dexec.mainClass=com.pleysje.plugged.StandardSymbolsJson}
 * or simply run this class from the IDE (working directory: backend).
 */
public final class StandardSymbolsJson {
    public static final String FIXTURE = "../frontend/src/test/fixtures/standard-symbols.json";

    private StandardSymbolsJson() {
    }

    public static String json(List<SymbolDto> symbols) {
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < symbols.size(); i++) {
            sb.append("  ");
            symbol(sb, symbols.get(i));
            sb.append(i < symbols.size() - 1 ? ",\n" : "\n");
        }
        return sb.append("]\n").toString();
    }

    private static void symbol(StringBuilder sb, SymbolDto s) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("k", s.k());
        m.put("name", s.name());
        m.put("cat", s.cat());
        m.put("parents", s.parents());
        m.put("place", s.place());
        m.put("shapes", s.shapes());
        if (s.sock() != null) m.put("sock", s.sock());
        if (Boolean.TRUE.equals(s.details())) m.put("details", true);
        m.put("v", s.v());
        m.put("builtin", s.builtin());
        m.put("modified", s.modified());
        value(sb, m);
    }

    private static void value(StringBuilder sb, Object o) {
        if (o == null) sb.append("null");
        else if (o instanceof String s) sb.append('"').append(s.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        else if (o instanceof Double d) sb.append(d == Math.rint(d) && Math.abs(d) < 1e9 ? String.valueOf(d.longValue()) : d.toString());
        else if (o instanceof Number || o instanceof Boolean) sb.append(o);
        else if (o instanceof Map<?, ?> m) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                value(sb, String.valueOf(e.getKey()));
                sb.append(':');
                value(sb, e.getValue());
            }
            sb.append('}');
        } else if (o instanceof List<?> l) {
            sb.append('[');
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) sb.append(',');
                value(sb, l.get(i));
            }
            sb.append(']');
        } else throw new IllegalArgumentException("unsupported " + o.getClass());
    }

    public static void main(String[] args) throws IOException {
        Path p = Path.of(args.length > 0 ? args[0] : FIXTURE);
        Files.createDirectories(p.getParent());
        Files.writeString(p, json(StandardSymbols.all()), StandardCharsets.UTF_8);
        System.out.println("written " + p.toAbsolutePath());
    }
}
