// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import static com.pleysje.plugged.catalog.SymbolShapes.arc;
import static com.pleysje.plugged.catalog.SymbolShapes.circle;
import static com.pleysje.plugged.catalog.SymbolShapes.line;
import static com.pleysje.plugged.catalog.SymbolShapes.round2;
import static com.pleysje.plugged.catalog.SymbolShapes.rect;
import static com.pleysje.plugged.catalog.SymbolShapes.text;
import static com.pleysje.plugged.catalog.SymbolShapes.weight;

import com.pleysje.plugged.dto.SymbolDto;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The standard symbols of the catalog, drawn after AREI Boek 1, hoofdstuk 2.13, tabel 2.23 (grafische symbolen).
 * <p>
 * Every symbol is drawn on a 24x24 grid. The eendraadschema chains the symbols of a circuit along a horizontal line, so the
 * connection point of a symbol is on the line y = 12 and the supply enters from the left. Where the PDF draws a symbol with a
 * vertical supply (sockets: the supply drops onto the arch) it is drawn rotated here, so the arch faces away from the supply.
 * Breakers and earthing are vertical symbols (they hang on the busbar).
 * <p>
 * The others (connection, busbar, differential, earthing, data, TV, buzzer, siren, smoke detector, domotics, sub board, modular
 * switch, light circuit, free element) have no counterpart there and keep their own drawing.
 * <p>
 * Bump {@link #VERSION} when a standard drawing changes: stored copies of standard symbols that were not edited by the user
 * are then replaced by the new standard when the application starts (see {@code SymbolService#seed()}).
 */
public final class StandardSymbols {
    public static final int VERSION = 11;

    // the categories of the catalog (Dutch: stored with the symbols; the frontend translates them for display)
    private static final String DISTRIBUTION = "Verdeling", SOCKETS = "Stopcontacten", LIGHTING = "Verlichting & bediening", APPLIANCES = "Toestellen",
            ENERGY = "Energie", OTHER = "Overig";

    /** The symbols that can hang in a circuit: the default for "may hang under" of a new symbol. */
    public static final List<String> ELEMENT_KEYS = List.of(
            "kring", "diff", "domotica", "subbord", "schakelaar", "schakelaar2", "schakelaar3", "verklikker", "wissel", "omschakelaar", "kruis",
            "dimmer", "drukknop", "lichtpunt", "stopcontact", "stopcontact_alg", "stopcontact_kid", "stopcontact_pekid", "stopcontact2",
            "stopcontact3", "trafo", "modulaire", "motor", "bel", "zoemer", "sirene", "klok", "data", "tv", "vrij",
            "lichtcircuit", "microgolf", "zonnepanelen", "omvormer", "batterij", "oven", "kookplaat", "wasmachine", "droogkast", "vaatwas",
            "koelkast", "diepvries", "airco", "ventilatie", "laadpaal", "boiler", "verwarming", "thermostaat", "rookmelder", "aftakdoos",
            "wandlamp", "tl", "noodlicht", "spot", "led", "wissel2", "rolluik", "beweging", "teleruptor", "dimmermodule", "relais", "minuterie");

    // ---- building blocks ----------------------------------------------------------------------------------------------

    @SafeVarargs
    private static List<Map<String, Object>> all(List<Map<String, Object>>... parts) {
        List<Map<String, Object>> shapes = new ArrayList<>();
        for (List<Map<String, Object>> part : parts) shapes.addAll(part);
        return shapes;
    }

    @SafeVarargs
    private static List<Map<String, Object>> of(Map<String, Object>... shapes) {
        return new ArrayList<>(List.of(shapes));
    }

    /** lamp: circle with a cross whose ends touch the circle */
    private static List<Map<String, Object>> lamp(double centerX, double centerY, double radius) {
        double offset = round2(radius * Math.sqrt(0.5));
        return of(
                circle(centerX, centerY, radius),
                line(round2(centerX - offset), round2(centerY - offset), round2(centerX + offset), round2(centerY + offset)),
                line(round2(centerX + offset), round2(centerY - offset), round2(centerX - offset), round2(centerY + offset)));
    }

    /** the span (in upstream units, after the first apex) that stacked sockets may use at the full size: the last arch of n sockets ends at the right edge of the grid, see {@link UpstreamSymbols} */
    private static final double STACK = 29;

    /** distance between chained sockets in upstream units (20 in the eendraadschema, a bit more so that the arches do not seem glued together); keep equal to PITCH in symbols.jsx */
    private static final double PITCH = 24;

    /**
     * socket (contactdoos) as in the eendraadschema: a line to the apex of a half circle that opens to the right, with an optional bar for the
     * protective conductor (pe) on the apex and little feet (kid) on the ends of the arch. n sockets are chained every PITCH upstream units
     * (the whole stack is scaled down when that does not fit the grid); h = waterproof (a property of a placed socket: p.h, there is no separate symbol for it). The frontend draws the same ({@code sockShapes} of symbols.jsx): keep them equal.
     */
    public static List<Map<String, Object>> socket(boolean earthed, boolean childSafe, boolean waterproof, int count) {
        // count sockets do not fit the grid at the full size: the whole stack is scaled down about its supply point (scale = 1 up to a double socket); same as sockShapes
        double scale = count > 1 ? Math.min(1, (35 + STACK) / (35 + (count - 1) * PITCH)) : 1,
                unit = UpstreamSymbols.U * scale,
                radius = round2(15 * unit);
        List<Map<String, Object>> shapes = of(line(1, 12, round2(1 - unit + unit * (21 + (count - 1) * PITCH)), 12));
        for (int index = 0; index < count; index++) {
            double apex = round2(1 - unit + unit * (21 + index * PITCH)), centerX = round2(1 - unit + unit * (36 + index * PITCH));
            if (earthed) shapes.add(weight(line(apex, round2(12 - radius), apex, round2(12 + radius)), UpstreamSymbols.W2));
            shapes.add(weight(arc(centerX, 12, radius, 90, 270), UpstreamSymbols.W2));
            if (childSafe) {
                shapes.add(weight(line(centerX, round2(12 + unit * -20), centerX, round2(12 + unit * -14.1)), UpstreamSymbols.W2));
                shapes.add(weight(line(centerX, round2(12 + unit * 20), centerX, round2(12 + unit * 14.1)), UpstreamSymbols.W2));
            }
        }
        if (waterproof) shapes.add(text(round2(1 - unit + unit * 21), round2(12 - radius - 1.8), "h", 4.5));
        return shapes;
    }

    /** the socket properties of a socket symbol, in the JSON format of the frontend (pe = earthed, kid = child safe, h = waterproof, n = count) */
    private static Map<String, Object> socketProperties(boolean earthed, boolean childSafe, boolean waterproof, int count) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("pe", earthed);
        if (childSafe) properties.put("kid", true);
        if (waterproof) properties.put("h", true);
        if (count > 1) properties.put("n", count);
        return properties;
    }

    /** automatic circuit breaker (kleine vermogensschakelaar): vertical, terminals above and below, the lever of the eendraadschema and (optional) its filled block */
    private static List<Map<String, Object>> breaker(boolean square) {
        return all(of(line(13, 2, 13, 5), line(13, 14, 13, 22)), square ? UpstreamSymbols.leverWithBlock() : UpstreamSymbols.lever());
    }

    // ---- the catalog --------------------------------------------------------------------------------------------------

    private static final List<SymbolDto> ALL = new ArrayList<>();

    /** the elements that have the extended details input (brand, type, serial number, ...) */
    private static final Set<String> WITH_DETAILS = Set.of("omvormer", "zonnepanelen", "batterij", "laadpaal");

    private static void define(String key, String name, String category, List<String> parents, List<Map<String, Object>> shapes, boolean placeable, Map<String, Object> socket) {
        ALL.add(new SymbolDto(key, name, category, List.copyOf(parents), placeable, List.copyOf(shapes), socket, VERSION, true, false, WITH_DETAILS.contains(key)));
    }

    private static void define(String key, String name, String category, List<String> parents, List<Map<String, Object>> shapes, boolean placeable) {
        define(key, name, category, parents, shapes, placeable, null);
    }

    private static List<String> plus(List<String> keys, String... more) {
        List<String> all = new ArrayList<>(keys);
        all.addAll(List.of(more));
        return all;
    }

    static {
        define("teller", "Teller (kWh)", DISTRIBUTION, List.of(), UpstreamSymbols.teller(), true);
        define("hoofdschakelaar", "Hoofdschakelaar", DISTRIBUTION, List.of("teller"), breaker(false), false);
        define("bord", "Verdeelbord", DISTRIBUTION, List.of("teller", "hoofdschakelaar", "diff", "bord"), of(rect(2, 8.5, 20, 7)), true);
        // the differential is drawn like a circuit breaker (kring): the lever with its filled block
        define("diff", "Differentieel (aardlek)", DISTRIBUTION, List.of("bord", "hoofdschakelaar", "teller", "subbord", "diff", "kring", "overspanning"), breaker(true), false);
        define("overspanning", "Overspanningsbeveiliging", DISTRIBUTION, List.of("bord"), UpstreamSymbols.overspanning(), false);
        define("kring", "Kring (automaat)", DISTRIBUTION, List.of("bord", "diff", "domotica", "subbord", "kring"), breaker(true), false);
        define("zekering", "Smeltveiligheid", DISTRIBUTION, List.of("bord", "diff"), UpstreamSymbols.zekering(), false);

        define("stopcontact_alg", "Stopcontact (algemeen symbool)", SOCKETS, ELEMENT_KEYS, socket(false, false, false, 1), true, socketProperties(false, false, false, 1));
        define("stopcontact", "Stopcontact", SOCKETS, ELEMENT_KEYS, socket(true, false, false, 1), true, socketProperties(true, false, false, 1));
        define("stopcontact_kid", "Stopcontact (kinderveiligheid)", SOCKETS, ELEMENT_KEYS, socket(false, true, false, 1), true, socketProperties(false, true, false, 1));
        define("stopcontact_pekid", "Stopcontact (aarding + kinderveiligheid)", SOCKETS, ELEMENT_KEYS, socket(true, true, false, 1), true, socketProperties(true, true, false, 1));
        define("stopcontact2", "Dubbel stopcontact", SOCKETS, ELEMENT_KEYS, socket(true, false, false, 2), true, socketProperties(true, false, false, 2));
        define("stopcontact3", "Drievoudig stopcontact", SOCKETS, ELEMENT_KEYS, socket(true, false, false, 3), true, socketProperties(true, false, false, 3));
        define("data", "Data (RJ45)", SOCKETS, ELEMENT_KEYS, of(line(1, 12, 9, 12), line(9, 5, 9, 19), line(9, 5, 16, 5), line(9, 19, 16, 19)), true);
        define("tv", "TV-aansluiting", SOCKETS, ELEMENT_KEYS, of(rect(5, 5, 14, 14), text(12, 15, "TV")), true);
        define("lichtpunt", "Lichtpunt", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.lichtpunt(), true);
        define("wandlamp", "Wandlamp", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.wandlamp(), true);
        define("tl", "TL-armatuur", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.tl(), true);
        define("spot", "Spot", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.spot(), true);
        define("led", "Led-verlichting", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.led(), true);
        define("noodlicht", "Noodverlichting", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.noodlicht(), true);
        define("schakelaar", "Enkelpolige schakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.schakelaar(), true);
        define("schakelaar2", "Tweepolige schakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.schakelaar2(), true);
        define("schakelaar3", "Driepolige schakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.schakelaar3(), true);
        define("verklikker", "Schakelaar met verklikkerlamp", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.verklikker(), true);
        // wisselschakelaar: point symmetric, a lever with flags up and a lever with flags down
        define("wissel", "Wisselschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.wissel(), true);
        // omschakelaar: two levers in a V above the hinge circle, the flags point outwards
        define("omschakelaar", "Omschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.omschakelaar(), true);
        define("wissel2", "Dubbele wisselschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.wissel2(), true);
        define("kruis", "Kruisschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.kruis(), true);
        define("rolluik", "Rolluikschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.rolluik(), true);
        define("beweging", "Bewegingsschakelaar", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.bewegingsschakelaar(), true);
        define("dimmer", "Dimmer", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.dimmer(), true);
        define("drukknop", "Drukknop", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.drukknop(), true);
        define("bel", "Bel", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.bel(), true);
        define("zoemer", "Zoemer", LIGHTING, ELEMENT_KEYS, of(line(1, 12, 12, 12), line(12, 6, 12, 18), line(12, 6, 16, 6), line(12, 18, 16, 18), arc(16, 12, 6, -90, 90)), true);
        define("sirene", "Sirene", LIGHTING, ELEMENT_KEYS, of(line(1, 12, 12, 12), line(12, 5, 12, 19), line(12, 5, 22, 12), line(12, 19, 22, 12)), true);
        define("klok", "Horloge", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.klok(), true);
        define("rookmelder", "Rookmelder", LIGHTING, ELEMENT_KEYS, of(circle(12, 12, 8), text(12, 15, "R")), true);
        define("thermostaat", "Thermostaat", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.thermostaat(), true);
        define("motor", "Motor", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.motor(), true);
        define("verwarming", "Elektrische verwarming", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.verwarming(), true);
        define("boiler", "Boiler", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.boiler(), true);
        define("kookplaat", "Kookplaat", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.kookplaat(), true);
        define("oven", "Oven", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.oven(), true);
        define("wasmachine", "Wasmachine", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.wasmachine(), true);
        define("droogkast", "Droogkast", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.droogkast(), true);
        define("vaatwas", "Vaatwasser", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.vaatwas(), true);
        define("koelkast", "Koelkast", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.koelkast(), true);
        define("diepvries", "Diepvriezer", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.diepvries(), true);
        define("airco", "Airco / warmtepomp", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.airco(), true);
        define("ventilatie", "Ventilator", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.ventilatie(), true);
        define("microgolf", "Microgolfoven", APPLIANCES, ELEMENT_KEYS, UpstreamSymbols.microgolf(), true);
        define("laadpaal", "Laadpaal EV", ENERGY, ELEMENT_KEYS, UpstreamSymbols.laadpaal(), true);
        define("zonnepanelen", "Zonnepanelen", ENERGY, ELEMENT_KEYS, UpstreamSymbols.zonnepanelen(), true);
        // omvormer DC -> AC: DC (a full and two dashed lines) top left, AC (a tilde) bottom right
        define("omvormer", "Omvormer", ENERGY, ELEMENT_KEYS, UpstreamSymbols.omvormer(), true);
        define("batterij", "Thuisbatterij", ENERGY, ELEMENT_KEYS, UpstreamSymbols.batterij(), true);

        define("domotica", "Domotica (kast)", OTHER, ELEMENT_KEYS, of(rect(3, 3, 18, 18), line(3, 10, 21, 10), circle(9, 16, 1.5), line(10.1, 14.9, 14, 12), line(14, 12, 15.5, 13.5)), true);
        define("subbord", "Onderbord", OTHER, plus(ELEMENT_KEYS, "bord"), of(rect(2, 5, 20, 14), line(2, 12, 22, 12)), true);
        define("trafo", "Transformator", OTHER, ELEMENT_KEYS, UpstreamSymbols.trafo(), true);
        define("modulaire", "Modulaire schakelaar", LIGHTING, ELEMENT_KEYS, of(rect(5, 2, 14, 19), line(5, 18.5, 19, 18.5), circle(10, 14.5, 1.6), line(11.1, 13.4, 15, 8), line(15, 8, 16.9, 10.3)), true);
        define("teleruptor", "Teleruptor", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.teleruptor(), true);
        define("dimmermodule", "Dimmer (modulair)", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.dimmerModule(), true);
        define("relais", "Relais", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.relais(), true);
        define("minuterie", "Minuterie (trappenlichtautomaat)", LIGHTING, ELEMENT_KEYS, UpstreamSymbols.minuterie(), true);
        define("lichtcircuit", "Lichtcircuit", LIGHTING, ELEMENT_KEYS, all(lamp(12, 12, 7), of(circle(12, 12, 10))), true);
        define("aftakdoos", "Aftakdoos", OTHER, ELEMENT_KEYS, UpstreamSymbols.aftakdoos(), true);
        define("aarding", "Aardingspunt", OTHER, List.of("bord"), of(line(12, 3, 12, 12), line(5, 12, 19, 12), line(8, 15, 16, 15), line(10, 18, 14, 18)), false);
        define("vrij", "Vrij element", OTHER, plus(ELEMENT_KEYS, "bord"), of(rect(2, 6, 20, 12), text(12, 15, "?")), true);
    }

    private static final Map<String, SymbolDto> BY_KEY;

    static {
        Map<String, SymbolDto> byKey = new LinkedHashMap<>();
        for (SymbolDto symbol : ALL) byKey.put(symbol.key(), symbol);
        BY_KEY = Collections.unmodifiableMap(byKey);
    }

    private StandardSymbols() {
    }

    /** The standard symbols in catalog order. */
    public static List<SymbolDto> all() {
        return Collections.unmodifiableList(ALL);
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