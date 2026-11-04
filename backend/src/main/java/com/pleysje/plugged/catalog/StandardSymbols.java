// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.ShapeRow;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The standard symbols that ship with the application, read from {@value #CATALOG} on the class path
 * (backend/src/main/resources/catalog/standard-symbols.json). The symbols were drawn after AREI Boek 1, hoofdstuk 2.13, tabel 2.23.
 * <p>
 * <b>Changing the standard symbols.</b> The catalog is made in the application itself: draw a standard symbol in the Componenten tab and
 * choose "make standard", then download the catalog with Beheer → Symbolen and replace the file above with it. On every start
 * ({@code SymbolService#seed()}) a new installation gets these symbols, and an existing one replaces its stored copies that nobody edited
 * when their drawing differs from the catalog; copies a user edited stay as they are.
 * <p>
 * Every symbol is drawn on a 24x24 grid. The eendraadschema chains the symbols of a circuit along a horizontal line, so the connection
 * point of a symbol is on the line y = 12 (StandardSymbolsTest checks it).
 */
public final class StandardSymbols {
    /** The number the stored copies of standard symbols carry; raising it replaces every unedited copy at the next start. */
    public static final int VERSION = 11;
    /** The catalog file on the class path. */
    public static final String CATALOG = "catalog/standard-symbols.json";

    /** The symbols that can hang in a circuit: the default for "may hang under" of a new symbol. */
    public static final List<String> ELEMENT_KEYS = List.of(
            "kring", "diff", "domotica", "subbord", "schakelaar", "schakelaar2", "schakelaar3", "verklikker", "wissel", "omschakelaar", "kruis",
            "dimmer", "drukknop", "lichtpunt", "stopcontact", "stopcontact_alg", "stopcontact_kid", "stopcontact_pekid", "stopcontact2",
            "stopcontact3", "trafo", "modulaire", "motor", "bel", "zoemer", "sirene", "klok", "data", "tv", "vrij",
            "lichtcircuit", "microgolf", "zonnepanelen", "omvormer", "batterij", "oven", "kookplaat", "wasmachine", "droogkast", "vaatwas",
            "koelkast", "diepvries", "airco", "ventilatie", "laadpaal", "boiler", "verwarming", "thermostaat", "rookmelder", "aftakdoos",
            "wandlamp", "tl", "noodlicht", "spot", "led", "wissel2", "rolluik", "beweging", "teleruptor", "dimmermodule", "relais", "minuterie");

    private static final List<SymbolDto> ALL;
    private static final Map<String, SymbolDto> BY_KEY;

    static {
        try (InputStream in = StandardSymbols.class.getClassLoader().getResourceAsStream(CATALOG)) {
            if (in == null) throw new IllegalStateException(CATALOG + " is missing from the class path");
            ALL = List.copyOf(asStandards(CatalogJson.read(in)));
        } catch (IOException exception) {
            throw new UncheckedIOException(CATALOG + " cannot be read", exception);
        }
        Map<String, SymbolDto> byKey = new LinkedHashMap<>();
        for (SymbolDto symbol : ALL) byKey.put(symbol.key(), symbol);
        BY_KEY = Collections.unmodifiableMap(byKey);
    }

    private StandardSymbols() {
    }

    /**
     * The symbols of a catalog file as standard symbols: built in, not modified, with {@link #VERSION}, and with their shapes exactly as the
     * database stores them (so a stored copy and the catalog compare equal).
     */
    static List<SymbolDto> asStandards(List<SymbolDto> symbols) {
        List<SymbolDto> standards = new ArrayList<>();
        for (SymbolDto symbol : symbols) {
            List<Map<String, Object>> shapes = new ArrayList<>();
            for (Map<String, Object> shape : symbol.shapes() == null ? List.<Map<String, Object>>of() : symbol.shapes()) shapes.add(ShapeRow.of(shape).toMap());
            standards.add(new SymbolDto(symbol.key(), symbol.name(), symbol.category(), symbol.parents() == null ? List.of() : List.copyOf(symbol.parents()),
                    !Boolean.FALSE.equals(symbol.placeable()), List.copyOf(shapes), symbol.socket(), VERSION, true, false, Boolean.TRUE.equals(symbol.details())));
        }
        return standards;
    }

    /** The standard symbols in catalog order. */
    public static List<SymbolDto> all() {
        return ALL;
    }

    /** The standard symbol with this key, or null when the key is not a standard symbol. */
    public static SymbolDto find(String key) {
        return BY_KEY.get(key);
    }

    /** The position of a standard symbol in the catalog, used to keep the catalog order. */
    public static int orderOf(String key) {
        int position = 0;
        for (String standardKey : BY_KEY.keySet()) {
            if (standardKey.equals(key)) return position;
            position++;
        }
        return -1;
    }
}
