// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import static com.pleysje.plugged.SymbolShapes.arc;
import static com.pleysje.plugged.SymbolShapes.circle;
import static com.pleysje.plugged.SymbolShapes.line;
import static com.pleysje.plugged.SymbolShapes.rd;
import static com.pleysje.plugged.SymbolShapes.rect;
import static com.pleysje.plugged.SymbolShapes.text;
import static com.pleysje.plugged.SymbolShapes.weight;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The standard symbols of the catalog, drawn after AREI Boek 1, hoofdstuk 2.13, tabel 2.23 (grafische symbolen).
 * <p>
 * Every symbol is drawn on a 24x24 grid. The eendraadschema chains the symbols of a circuit along a horizontal line, so the
 * connection point of a symbol is on the line y = 12 and the supply enters from the left. Where the PDF draws a symbol with a
 * vertical supply (sockets: the supply drops onto the arch) it is drawn rotated here, so the arch faces away from the supply.
 * Breakers and earthing are vertical symbols (they hang on the busbar).
 * <p>
 * Most symbols are drawn like those of the online eendraadschema (https://eendraadschema.goethals-jacobs.be): see {@link UpstreamSymbols}.
 * The others (connection, busbar, differential, earthing, data, TV, buzzer, siren, smoke detector, domotics, sub board, modular
 * switch, light circuit, free element) have no counterpart there and keep their own drawing.
 * <p>
 * Bump {@link #VERSION} when a standard drawing changes: stored copies of standard symbols that were not edited by the user
 * are then replaced by the new standard when the application starts (see {@link SymbolService#seed()}).
 */
public final class StandardSymbols {
    public static final int VERSION = 9;

    private static final String V = "Verdeling", S = "Stopcontacten", O = "Verlichting & bediening", A = "Toestellen", E = "Energie", G = "Overig";

    /** The symbols that can hang in a circuit: the default for "may hang under" of a new symbol. */
    public static final List<String> ELEMENT_KEYS = List.of(
            "kring", "domotica", "subbord", "schakelaar", "schakelaar2", "schakelaar3", "verklikker", "wissel", "omschakelaar", "kruis",
            "dimmer", "drukknop", "lichtpunt", "stopcontact", "stopcontact_alg", "stopcontact_kid", "stopcontact_pekid", "stopcontact2",
            "stopcontact3", "stopcontact_h", "trafo", "modulaire", "motor", "bel", "zoemer", "sirene", "klok", "data", "tv", "vrij",
            "lichtcircuit", "microgolf", "zonnepanelen", "omvormer", "batterij", "oven", "kookplaat", "wasmachine", "droogkast", "vaatwas",
            "koelkast", "diepvries", "airco", "ventilatie", "laadpaal", "boiler", "verwarming", "thermostaat", "rookmelder", "aftakdoos",
            "wandlamp", "tl", "noodlicht", "spot", "led", "wissel2", "rolluik", "beweging", "teleruptor", "dimmermodule", "relais", "minuterie");

    private static final List<String> EL = ELEMENT_KEYS;

    // ---- building blocks ----------------------------------------------------------------------------------------------

    @SafeVarargs
    private static List<Map<String, Object>> all(List<Map<String, Object>>... parts) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (List<Map<String, Object>> p : parts) out.addAll(p);
        return out;
    }

    @SafeVarargs
    private static List<Map<String, Object>> of(Map<String, Object>... shapes) {
        return new ArrayList<>(List.of(shapes));
    }

    /** lamp: circle with a cross whose ends touch the circle */
    private static List<Map<String, Object>> lamp(double cx, double cy, double r) {
        double d = rd(r * Math.sqrt(0.5));
        return of(circle(cx, cy, r), line(rd(cx - d), rd(cy - d), rd(cx + d), rd(cy + d)), line(rd(cx + d), rd(cy - d), rd(cx - d), rd(cy + d)));
    }

    /** the right edge a stacked socket may reach, in upstream units: the last arch of n sockets ends there (see {@link UpstreamSymbols}) */
    private static final double STACK = 29;

    /**
     * socket (contactdoos) as in the eendraadschema: a line to the apex of a half circle that opens to the right, with an optional bar for the
     * protective conductor (pe) on the apex and little feet (kid) on the ends of the arch. n sockets are chained every 20 upstream units
     * (closer together when that does not fit the grid); h = waterproof. The frontend draws the same ({@code sockShapes} of symbols.jsx): keep them equal.
     */
    public static List<Map<String, Object>> socket(boolean pe, boolean kid, boolean h, int n) {
        double r = rd(15 * UpstreamSymbols.U), pitch = n > 1 ? Math.min(20, STACK / (n - 1)) : 20;
        List<Map<String, Object>> out = of(line(1, 12, UpstreamSymbols.ux(21 + (n - 1) * pitch), 12));
        for (int k = 0; k < n; k++) {
            double apex = UpstreamSymbols.ux(21 + k * pitch), cx = UpstreamSymbols.ux(36 + k * pitch);
            if (pe) out.add(weight(line(apex, rd(12 - r), apex, rd(12 + r)), UpstreamSymbols.W2));
            out.add(weight(arc(cx, 12, r, 90, 270), UpstreamSymbols.W2));
            if (kid) {
                out.add(weight(line(cx, UpstreamSymbols.uy(-20), cx, UpstreamSymbols.uy(-14.1)), UpstreamSymbols.W2));
                out.add(weight(line(cx, UpstreamSymbols.uy(20), cx, UpstreamSymbols.uy(14.1)), UpstreamSymbols.W2));
            }
        }
        if (h && n == 1) out.add(text(UpstreamSymbols.ux(21), rd(12 - r - 1.8), "h", 4.5));
        return out;
    }

    private static Map<String, Object> sock(boolean pe, boolean kid, boolean h, int n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pe", pe);
        if (kid) m.put("kid", true);
        if (h) m.put("h", true);
        if (n > 1) m.put("n", n);
        return m;
    }

    /** automatic circuit breaker (kleine vermogensschakelaar): vertical, terminals above and below, the lever of the eendraadschema and (optional) its filled block */
    private static List<Map<String, Object>> breaker(boolean square) {
        return all(of(line(13, 2, 13, 5), line(13, 14, 13, 22)), square ? UpstreamSymbols.leverWithBlock() : UpstreamSymbols.lever());
    }

    // ---- the catalog --------------------------------------------------------------------------------------------------

    private static final List<SymbolDto> ALL = new ArrayList<>();

    /** the elements that have the extended details input (brand, type, serial number, ...) */
    private static final java.util.Set<String> DETAILS = java.util.Set.of("omvormer", "zonnepanelen", "batterij", "laadpaal");

    private static void x(String k, String name, String cat, List<String> parents, List<Map<String, Object>> shapes, boolean place, Map<String, Object> sock) {
        ALL.add(new SymbolDto(k, name, cat, List.copyOf(parents), place, List.copyOf(shapes), sock, VERSION, true, false, DETAILS.contains(k)));
    }

    private static void x(String k, String name, String cat, List<String> parents, List<Map<String, Object>> shapes, boolean place) {
        x(k, name, cat, parents, shapes, place, null);
    }

    private static List<String> plus(List<String> l, String... more) {
        List<String> out = new ArrayList<>(l);
        out.addAll(List.of(more));
        return out;
    }

    static {
        x("aansluiting", "Aansluiting net", V, List.of(), of(rect(4, 6, 16, 12), line(4, 6, 20, 18), line(4, 18, 20, 6)), false);
        x("teller", "Teller (kWh)", V, List.of("aansluiting"), UpstreamSymbols.teller(), true);
        x("hoofdschakelaar", "Hoofdschakelaar", V, List.of("aansluiting", "teller"), breaker(false), false);
        x("bord", "Verdeelbord", V, List.of("aansluiting", "teller", "hoofdschakelaar", "diff", "bord"), of(rect(2, 8.5, 20, 7)), true);
        // the differential is drawn like a circuit breaker (kring): the lever with its filled block
        x("diff", "Differentieel (aardlek)", V, List.of("bord", "hoofdschakelaar", "aansluiting", "teller"), breaker(true), false);
        x("overspanning", "Overspanningsbeveiliging", V, List.of("bord"), UpstreamSymbols.overspanning(), false);
        x("kring", "Kring (automaat)", V, List.of("bord", "diff", "domotica", "subbord", "kring"), breaker(true), false);
        x("zekering", "Smeltveiligheid", V, List.of("bord", "diff"), UpstreamSymbols.zekering(), false);

        x("stopcontact_alg", "Stopcontact (algemeen symbool)", S, EL, socket(false, false, false, 1), true, sock(false, false, false, 1));
        x("stopcontact", "Stopcontact", S, EL, socket(true, false, false, 1), true, sock(true, false, false, 1));
        x("stopcontact_kid", "Stopcontact (kinderveiligheid)", S, EL, socket(false, true, false, 1), true, sock(false, true, false, 1));
        x("stopcontact_pekid", "Stopcontact (aarding + kinderveiligheid)", S, EL, socket(true, true, false, 1), true, sock(true, true, false, 1));
        x("stopcontact2", "Dubbel stopcontact", S, EL, socket(true, false, false, 2), true, sock(true, false, false, 2));
        x("stopcontact3", "Drievoudig stopcontact", S, EL, socket(true, false, false, 3), true, sock(true, false, false, 3));
        x("stopcontact_h", "Waterdicht stopcontact", S, EL, socket(true, false, true, 1), true, sock(true, false, true, 1));
        x("data", "Data (RJ45)", S, EL, of(line(1, 12, 9, 12), line(9, 5, 9, 19), line(9, 5, 16, 5), line(9, 19, 16, 19)), true);
        x("tv", "TV-aansluiting", S, EL, of(rect(5, 5, 14, 14), text(12, 15, "TV")), true);
        x("lichtpunt", "Lichtpunt", O, EL, UpstreamSymbols.lichtpunt(), true);
        x("wandlamp", "Wandlamp", O, EL, UpstreamSymbols.wandlamp(), true);
        x("tl", "TL-armatuur", O, EL, UpstreamSymbols.tl(), true);
        x("spot", "Spot", O, EL, UpstreamSymbols.spot(), true);
        x("led", "Led-verlichting", O, EL, UpstreamSymbols.led(), true);
        x("noodlicht", "Noodverlichting", O, EL, UpstreamSymbols.noodlicht(), true);
        x("schakelaar", "Enkelpolige schakelaar", O, EL, UpstreamSymbols.schakelaar(), true);
        x("schakelaar2", "Tweepolige schakelaar", O, EL, UpstreamSymbols.schakelaar2(), true);
        x("schakelaar3", "Driepolige schakelaar", O, EL, UpstreamSymbols.schakelaar3(), true);
        x("verklikker", "Schakelaar met verklikkerlamp", O, EL, UpstreamSymbols.verklikker(), true);
        // wisselschakelaar: point symmetric, a lever with flags up and a lever with flags down
        x("wissel", "Wisselschakelaar", O, EL, UpstreamSymbols.wissel(), true);
        // omschakelaar: two levers in a V above the hinge circle, the flags point outwards
        x("omschakelaar", "Omschakelaar", O, EL, UpstreamSymbols.omschakelaar(), true);
        x("wissel2", "Dubbele wisselschakelaar", O, EL, UpstreamSymbols.wissel2(), true);
        x("kruis", "Kruisschakelaar", O, EL, UpstreamSymbols.kruis(), true);
        x("rolluik", "Rolluikschakelaar", O, EL, UpstreamSymbols.rolluik(), true);
        x("beweging", "Bewegingsschakelaar", O, EL, UpstreamSymbols.bewegingsschakelaar(), true);
        x("dimmer", "Dimmer", O, EL, UpstreamSymbols.dimmer(), true);
        x("drukknop", "Drukknop", O, EL, UpstreamSymbols.drukknop(), true);
        x("bel", "Bel", O, EL, UpstreamSymbols.bel(), true);
        x("zoemer", "Zoemer", O, EL, of(line(1, 12, 12, 12), line(12, 6, 12, 18), line(12, 6, 16, 6), line(12, 18, 16, 18), arc(16, 12, 6, -90, 90)), true);
        x("sirene", "Sirene", O, EL, of(line(1, 12, 12, 12), line(12, 5, 12, 19), line(12, 5, 22, 12), line(12, 19, 22, 12)), true);
        x("klok", "Horloge", O, EL, UpstreamSymbols.klok(), true);
        x("rookmelder", "Rookmelder", O, EL, of(circle(12, 12, 8), text(12, 15, "R")), true);
        x("thermostaat", "Thermostaat", O, EL, UpstreamSymbols.thermostaat(), true);
        x("motor", "Motor", A, EL, UpstreamSymbols.motor(), true);
        x("verwarming", "Elektrische verwarming", A, EL, UpstreamSymbols.verwarming(), true);
        x("boiler", "Boiler", A, EL, UpstreamSymbols.boiler(), true);
        x("kookplaat", "Kookplaat", A, EL, UpstreamSymbols.kookplaat(), true);
        x("oven", "Oven", A, EL, UpstreamSymbols.oven(), true);
        x("wasmachine", "Wasmachine", A, EL, UpstreamSymbols.wasmachine(), true);
        x("droogkast", "Droogkast", A, EL, UpstreamSymbols.droogkast(), true);
        x("vaatwas", "Vaatwasser", A, EL, UpstreamSymbols.vaatwas(), true);
        x("koelkast", "Koelkast", A, EL, UpstreamSymbols.koelkast(), true);
        x("diepvries", "Diepvriezer", A, EL, UpstreamSymbols.diepvries(), true);
        x("airco", "Airco / warmtepomp", A, EL, UpstreamSymbols.airco(), true);
        x("ventilatie", "Ventilator", A, EL, UpstreamSymbols.ventilatie(), true);
        x("microgolf", "Microgolfoven", A, EL, UpstreamSymbols.microgolf(), true);
        x("laadpaal", "Laadpaal EV", E, EL, UpstreamSymbols.laadpaal(), true);
        x("zonnepanelen", "Zonnepanelen", E, EL, UpstreamSymbols.zonnepanelen(), true);
        // omvormer DC -> AC: DC (a full and two dashed lines) top left, AC (a tilde) bottom right
        x("omvormer", "Omvormer", E, EL, UpstreamSymbols.omvormer(), true);
        x("batterij", "Thuisbatterij", E, EL, UpstreamSymbols.batterij(), true);

        x("domotica", "Domotica (kast)", G, EL, of(rect(3, 3, 18, 18), line(3, 10, 21, 10), circle(9, 16, 1.5), line(10.1, 14.9, 14, 12), line(14, 12, 15.5, 13.5)), true);
        x("subbord", "Onderbord", G, plus(EL, "bord"), of(rect(2, 5, 20, 14), line(2, 12, 22, 12)), true);
        x("trafo", "Transformator", G, EL, UpstreamSymbols.trafo(), true);
        x("modulaire", "Modulaire schakelaar", O, EL, of(rect(5, 2, 14, 19), line(5, 18.5, 19, 18.5), circle(10, 14.5, 1.6), line(11.1, 13.4, 15, 8), line(15, 8, 16.9, 10.3)), true);
        x("teleruptor", "Teleruptor", O, EL, UpstreamSymbols.teleruptor(), true);
        x("dimmermodule", "Dimmer (modulair)", O, EL, UpstreamSymbols.dimmerModule(), true);
        x("relais", "Relais", O, EL, UpstreamSymbols.relais(), true);
        x("minuterie", "Minuterie (trappenlichtautomaat)", O, EL, UpstreamSymbols.minuterie(), true);
        x("lichtcircuit", "Lichtcircuit", O, EL, all(lamp(12, 12, 7), of(circle(12, 12, 10))), true);
        x("aftakdoos", "Aftakdoos", G, EL, UpstreamSymbols.aftakdoos(), true);
        x("aarding", "Aardingspunt", G, List.of("bord", "aansluiting"), of(line(12, 3, 12, 12), line(5, 12, 19, 12), line(8, 15, 16, 15), line(10, 18, 14, 18)), false);
        x("vrij", "Vrij element", G, plus(EL, "bord"), of(rect(2, 6, 20, 12), text(12, 15, "?")), true);
    }

    private static final Map<String, SymbolDto> BY_KEY;

    static {
        Map<String, SymbolDto> m = new LinkedHashMap<>();
        for (SymbolDto d : ALL) m.put(d.k(), d);
        BY_KEY = Collections.unmodifiableMap(m);
    }

    private StandardSymbols() {
    }

    /** The standard symbols in catalog order. */
    public static List<SymbolDto> all() {
        return Collections.unmodifiableList(ALL);
    }

    /** The standard symbol with this key, or null when the key is not a standard symbol. */
    public static SymbolDto find(String k) {
        return BY_KEY.get(k);
    }

    /** The position of a standard symbol in the catalog, used to keep the catalog order. */
    public static int orderOf(String k) {
        int i = 0;
        for (String key : BY_KEY.keySet()) {
            if (key.equals(k)) return i;
            i++;
        }
        return -1;
    }
}