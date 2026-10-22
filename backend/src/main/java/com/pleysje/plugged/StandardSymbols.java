// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import static com.pleysje.plugged.SymbolShapes.arc;
import static com.pleysje.plugged.SymbolShapes.block;
import static com.pleysje.plugged.SymbolShapes.circle;
import static com.pleysje.plugged.SymbolShapes.dot;
import static com.pleysje.plugged.SymbolShapes.line;
import static com.pleysje.plugged.SymbolShapes.rd;
import static com.pleysje.plugged.SymbolShapes.rect;
import static com.pleysje.plugged.SymbolShapes.text;

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
 * Switches keep the lever up, as in the PDF. Breakers and earthing are vertical symbols (they hang on the busbar).
 * <p>
 * Bump {@link #VERSION} when a standard drawing changes: stored copies of standard symbols that were not edited by the user
 * are then replaced by the new standard when the application starts (see {@link SymbolService#seed()}).
 */
public final class StandardSymbols {
    public static final int VERSION = 5;

    private static final String V = "Verdeling", S = "Stopcontacten", O = "Verlichting & bediening", A = "Toestellen", E = "Energie", G = "Overig";

    /** The symbols that can hang in a circuit: the default for "may hang under" of a new symbol. */
    public static final List<String> ELEMENT_KEYS = List.of(
            "kring", "domotica", "subbord", "schakelaar", "schakelaar2", "schakelaar3", "verklikker", "wissel", "omschakelaar", "kruis",
            "dimmer", "drukknop", "lichtpunt", "stopcontact", "stopcontact_alg", "stopcontact_kid", "stopcontact_pekid", "stopcontact2",
            "stopcontact3", "stopcontact_h", "trafo", "modulaire", "motor", "bel", "zoemer", "sirene", "klok", "data", "tv", "vrij",
            "lichtcircuit", "microgolf", "zonnepanelen", "omvormer", "batterij", "oven", "kookplaat", "wasmachine", "droogkast", "vaatwas",
            "koelkast", "diepvries", "airco", "ventilatie", "laadpaal", "boiler", "verwarming", "thermostaat", "rookmelder", "aftakdoos",
            "wandlamp", "tl", "noodlicht");

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

    /** a cross centred on (cx, cy) */
    private static List<Map<String, Object>> cross(double cx, double cy, double r) {
        return of(line(cx - r, cy - r, cx + r, cy + r), line(cx - r, cy + r, cx + r, cy - r));
    }

    // Switches, after the PDF: hinge circle with the supply entering from the left, a lever that leans 25 degrees from the vertical and
    // flags that are perpendicular to the lever (one per pole).
    private static final double LEAN = Math.toRadians(25), UX = Math.sin(LEAN), UY = -Math.cos(LEAN), PX = Math.cos(LEAN), PY = Math.sin(LEAN);
    private static final double HINGE = 3, FLAG = 3.4, POLE = 3;

    private static double px(double cx, double dx, double len) {
        return rd(cx + dx * len);
    }

    /** a lever from the hinge circle (centre cx, cy) along the unit vector (ux, uy), with `flags` flags at its end, pointing to the side (fx, fy) */
    private static List<Map<String, Object>> arm(double cx, double cy, double ux, double uy, double len, int flags, double fx, double fy) {
        double ex = cx + (HINGE + len) * ux, ey = cy + (HINGE + len) * uy;
        List<Map<String, Object>> out = of(line(rd(cx + HINGE * ux), rd(cy + HINGE * uy), rd(ex), rd(ey)));
        for (int k = 0; k < flags; k++) {
            double sx = ex - k * POLE * ux, sy = ey - k * POLE * uy;
            out.add(line(rd(sx), rd(sy), rd(sx + FLAG * fx), rd(sy + FLAG * fy)));
        }
        return out;
    }

    private static List<Map<String, Object>> lever(int flags) {
        double cx = 7;
        return all(of(line(1, 12, cx - HINGE, 12), circle(cx, 12, HINGE)), arm(cx, 12, UX, UY, 9, flags, PX, PY));
    }

    /** socket (contactdoos): pe = bar for the protective conductor, kid = little feet on the arch, h = waterproof, n = number of sockets */
    public static List<Map<String, Object>> socket(boolean pe, boolean kid, boolean h, int n) {
        double r = 4.5, x0 = 4, sp = n > 1 ? rd(Math.min(4, (19 - r) / (n - 1))) : 0;
        List<Map<String, Object>> out = of(line(1, 12, x0, 12));
        if (pe && n == 1) out.add(line(x0, 12 - 5.2, x0, 12 + 5.2));
        for (int k = 0; k < n; k++) {
            double cx = rd(x0 + r + k * sp);
            out.add(arc(cx, 12, r, 90, 270));
            if (kid) {
                out.add(line(cx, rd(12 - r - 1.3), cx, rd(12 - r)));
                out.add(line(cx, rd(12 + r), cx, rd(12 + r + 1.3)));
            }
        }
        if (h && n == 1) out.add(text(13, 9, "h", 8));
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

    /** appliance (verbruiker): supply line and a square at the right */
    private static List<Map<String, Object>> app(List<Map<String, Object>> shapes) {
        return all(of(line(1, 12, 8, 12), rect(8, 5, 14, 14)), shapes);
    }

    private static List<Map<String, Object>> tilde(double cx, double cy) {
        return of(arc(rd(cx - 1.5), cy, 1.5, 180, 360), arc(rd(cx + 1.5), cy, 1.5, 0, 180));
    }

    private static List<Map<String, Object>> snow(double cx, double cy, double r) {
        double a = rd(r * 0.866), b = rd(r * 0.5);
        return of(line(cx, cy - r, cx, cy + r), line(rd(cx - a), rd(cy - b), rd(cx + a), rd(cy + b)), line(rd(cx - a), rd(cy + b), rd(cx + a), rd(cy - b)));
    }

    /** automatic circuit breaker (kleine vermogensschakelaar): vertical, terminals above and below, a lever and (optional) a filled block */
    private static List<Map<String, Object>> breaker(boolean square) {
        List<Map<String, Object>> out = of(line(13, 2, 13, 5), line(13, 14, 13, 22), line(13, 14, 9.6, 5));
        if (square) out.add(block(8.3, 2.4, 2.6, 2.6));
        return out;
    }

    private static List<Map<String, Object>> hatch(double x1, double x2, double y1, double y2, int n) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double x = rd(x1 + (x2 - x1) * i / (n - 1));
            out.add(line(x, y1, x, y2));
        }
        return out;
    }

    /** vertical lines inside a circle (boiler) */
    private static List<Map<String, Object>> circleHatch(double cx, double cy, double r, int n) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double x = rd(cx - r + (i + 1) * 2 * r / (n + 1)), d = rd(Math.sqrt(r * r - (x - cx) * (x - cx)));
            out.add(line(x, rd(cy - d), x, rd(cy + d)));
        }
        return out;
    }

    // ---- the catalog --------------------------------------------------------------------------------------------------

    private static final List<SymbolDto> ALL = new ArrayList<>();

    private static void x(String k, String name, String cat, List<String> parents, List<Map<String, Object>> shapes, boolean place, Map<String, Object> sock) {
        ALL.add(new SymbolDto(k, name, cat, List.copyOf(parents), place, List.copyOf(shapes), sock, VERSION, true, false));
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
        x("teller", "Teller (kWh)", V, List.of("aansluiting"), of(line(1, 12, 8, 12), rect(8, 5, 14, 14), line(8, 8, 22, 8), text(15, 16.5, "kWh", 5.5)), true);
        x("hoofdschakelaar", "Hoofdschakelaar", V, List.of("aansluiting", "teller"), breaker(false), false);
        x("bord", "Verdeelbord", V, List.of("aansluiting", "teller", "hoofdschakelaar", "diff", "bord"), of(rect(2, 8.5, 20, 7)), true);
        x("diff", "Differentieel (aardlek)", V, List.of("bord", "hoofdschakelaar", "aansluiting", "teller"),
                all(breaker(false), of(line(13, 12, 15, 12), rect(15, 10, 7, 4))), false);
        x("overspanning", "Overspanningsbeveiliging", V, List.of("bord"), of(rect(3, 7, 18, 10), text(12, 15, "SPD")), false);
        x("kring", "Kring (automaat)", V, List.of("bord", "diff", "domotica", "subbord", "kring"), breaker(true), false);
        x("zekering", "Smeltveiligheid", V, List.of("bord", "diff"), of(line(1, 12, 23, 12), rect(5, 8.5, 14, 7)), false);

        x("stopcontact_alg", "Stopcontact (algemeen symbool)", S, EL, socket(false, false, false, 1), true, sock(false, false, false, 1));
        x("stopcontact", "Stopcontact", S, EL, socket(true, false, false, 1), true, sock(true, false, false, 1));
        x("stopcontact_kid", "Stopcontact (kinderveiligheid)", S, EL, socket(false, true, false, 1), true, sock(false, true, false, 1));
        x("stopcontact_pekid", "Stopcontact (aarding + kinderveiligheid)", S, EL, socket(true, true, false, 1), true, sock(true, true, false, 1));
        x("stopcontact2", "Dubbel stopcontact", S, EL, socket(true, false, false, 2), true, sock(true, false, false, 2));
        x("stopcontact3", "Drievoudig stopcontact", S, EL, socket(true, false, false, 3), true, sock(true, false, false, 3));
        x("stopcontact_h", "Waterdicht stopcontact", S, EL, socket(true, false, true, 1), true, sock(true, false, true, 1));
        x("data", "Data (RJ45)", S, EL, of(line(1, 12, 9, 12), line(9, 5, 9, 19), line(9, 5, 16, 5), line(9, 19, 16, 19)), true);
        x("tv", "TV-aansluiting", S, EL, of(rect(5, 5, 14, 14), text(12, 15, "TV")), true);

        x("lichtpunt", "Lichtpunt", O, EL, all(of(line(1, 12, 15, 12)), cross(15, 12, 5)), true);
        x("wandlamp", "Wandlamp", O, EL, all(of(line(1, 12, 9, 12)), cross(9, 12, 5), of(line(16, 4, 16, 20))), true);
        x("tl", "TL-armatuur", O, EL, of(line(3, 12, 21, 12), line(3, 6, 3, 18), line(21, 6, 21, 18)), true);
        x("noodlicht", "Noodverlichting", O, EL, all(of(rect(3, 3, 18, 18)), cross(12, 12, 8.2), of(dot(12, 12, 1.8))), true);

        x("schakelaar", "Enkelpolige schakelaar", O, EL, lever(1), true);
        x("schakelaar2", "Tweepolige schakelaar", O, EL, lever(2), true);
        x("schakelaar3", "Driepolige schakelaar", O, EL, lever(3), true);
        x("verklikker", "Schakelaar met verklikkerlamp", O, EL,
                all(of(line(1, 12, 4, 12)), lamp(7, 12, HINGE), arm(7, 12, UX, UY, 9, 1, PX, PY)), true);
        // wisselschakelaar: point symmetric, a lever with flags up and a lever with flags down
        x("wissel", "Wisselschakelaar", O, EL,
                all(of(line(1, 12, 9, 12), circle(12, 12, HINGE)), arm(12, 12, UX, UY, 8, 1, PX, PY), arm(12, 12, -UX, -UY, 8, 1, -PX, -PY)), true);
        // omschakelaar: two levers in a V above the hinge circle, the flags point outwards
        x("omschakelaar", "Omschakelaar", O, EL,
                all(of(line(1, 12, 6, 12), circle(9, 12, HINGE)), arm(9, 12, -UX, UY, 9, 1, -PX, PY), arm(9, 12, UX, UY, 9, 1, PX, PY)), true);
        x("kruis", "Kruisschakelaar", O, EL,
                all(of(line(1, 12, 9, 12), circle(12, 12, HINGE)), arm(12, 12, -UX, UY, 8, 1, -PX, PY), arm(12, 12, UX, UY, 8, 1, PX, PY),
                        arm(12, 12, -UX, -UY, 8, 1, -PX, -PY), arm(12, 12, UX, -UY, 8, 1, PX, -PY)), true);
        x("dimmer", "Dimmer", O, EL, all(lever(0), of(
                line(rd(7 + (HINGE + 3) * UX), rd(12 + (HINGE + 3) * UY), 16.5, 4.5), line(16.5, 4.5, 16.5, 9.1), line(16.5, 9.1, rd(7 + (HINGE + 3) * UX), rd(12 + (HINGE + 3) * UY)))), true);
        x("drukknop", "Drukknop", O, EL, of(circle(12, 12, 8), circle(12, 12, 2.3)), true);
        x("bel", "Bel", O, EL, of(line(1, 12, 12, 12), line(12, 6, 12, 18), arc(12, 12, 6, -90, 90)), true);
        x("zoemer", "Zoemer", O, EL, of(line(1, 12, 12, 12), line(12, 6, 12, 18), line(12, 6, 16, 6), line(12, 18, 16, 18), arc(16, 12, 6, -90, 90)), true);
        x("sirene", "Sirene", O, EL, of(line(1, 12, 12, 12), line(12, 5, 12, 19), line(12, 5, 22, 12), line(12, 19, 22, 12)), true);
        x("klok", "Horloge", O, EL, of(circle(12, 12, 8), line(12, 12, 12, 6), line(12, 12, 7, 12), dot(12, 12, 1)), true);
        x("rookmelder", "Rookmelder", O, EL, of(circle(12, 12, 8), text(12, 15, "R")), true);
        x("thermostaat", "Thermostaat", O, EL, of(rect(2, 7, 20, 10), circle(12, 13.5, 4), line(8, 13.5, 16, 13.5)), true);

        x("motor", "Motor", A, EL, of(line(1, 12, 6, 12), circle(14, 12, 8), text(14, 15.5, "M", 11)), true);
        x("verwarming", "Elektrische verwarming", A, EL, all(of(line(1, 12, 10, 12), rect(10, 6, 12, 12)), hatch(11.5, 20.5, 6, 18, 5)), true);
        x("boiler", "Boiler", A, EL, all(of(circle(12, 12, 8)), circleHatch(12, 12, 8, 7)), true);
        x("kookplaat", "Kookplaat", A, EL, app(of(dot(12.5, 9.5, 1.6), dot(17.5, 9.5, 1.6), dot(17.5, 14.5, 1.6))), true);
        x("oven", "Oven", A, EL, app(of(line(8, 8, 22, 8), dot(15, 14, 1.8))), true);
        x("wasmachine", "Wasmachine", A, EL, app(of(circle(15, 12, 4.5), dot(15, 12, 1.8))), true);
        x("droogkast", "Droogkast", A, EL, app(of(circle(13.5, 9, 1.8), circle(17, 9, 1.8), dot(15, 15, 1.6))), true);
        x("vaatwas", "Vaatwasser", A, EL, app(of(line(8, 5, 13.2, 10.2), line(16.8, 13.8, 22, 19), line(22, 5, 16.8, 10.2), line(13.2, 13.8, 8, 19), circle(15, 12, 2.5))), true);
        x("koelkast", "Koelkast", A, EL, app(snow(15, 12, 4)), true);
        x("diepvries", "Diepvriezer", A, EL, all(of(line(1, 12, 5, 12), rect(5, 7, 17, 10)), snow(8.5, 12, 2.2), snow(13.5, 12, 2.2), snow(18.5, 12, 2.2)), true);
        x("airco", "Airco / warmtepomp", A, EL, of(rect(2, 6, 20, 12), text(12, 15, "AC")), true);
        x("ventilatie", "Ventilator", A, EL, app(of(circle(12.5, 12, 2.5), circle(17.5, 12, 2.5))), true);
        x("microgolf", "Microgolfoven", A, EL, app(all(tilde(15, 9.5), tilde(15, 14.5))), true);

        x("laadpaal", "Laadpaal EV", E, EL, of(rect(4, 3, 11, 18), rect(6, 5, 7, 3.5), line(9.5, 10, 9.5, 18), line(17, 3, 17, 18), rect(16, 3, 2, 2.5), line(3, 21, 16, 21)), true);
        x("zonnepanelen", "Zonnepanelen", E, EL,
                of(rect(3, 4, 18, 16), line(3, 14, 21, 14), line(6, 6.5, 11, 11.5), line(11, 11.5, 11, 8.7), line(11, 11.5, 8.2, 11.5), line(9, 5.5, 14, 10.5)), true);
        // omvormer DC -> AC: DC (a full and two dashed lines) top left, AC (a tilde) bottom right
        x("omvormer", "Omvormer", E, EL,
                all(of(rect(3, 4, 18, 16), line(3, 20, 21, 4), line(5.5, 7.5, 10.5, 7.5), line(5.5, 9.5, 7, 9.5), line(9, 9.5, 10.5, 9.5)), tilde(16, 16)), true);
        x("batterij", "Thuisbatterij", E, EL, of(rect(3, 8, 16, 10), rect(19, 11, 3, 4), line(8, 10, 8, 16)), true);

        x("domotica", "Domotica (kast)", G, EL, of(rect(3, 3, 18, 18), line(3, 10, 21, 10), circle(9, 16, 1.5), line(10.1, 14.9, 14, 12), line(14, 12, 15.5, 13.5)), true);
        x("subbord", "Onderbord", G, plus(EL, "bord"), of(rect(2, 5, 20, 14), line(2, 12, 22, 12)), true);
        x("trafo", "Transformator", G, EL, of(line(1, 12, 3, 12), circle(9, 12, 6), circle(15, 12, 6), line(21, 12, 23, 12)), true);
        x("modulaire", "Modulaire schakelaar", O, EL, of(rect(5, 2, 14, 19), line(5, 18.5, 19, 18.5), circle(10, 14.5, 1.6), line(11.1, 13.4, 15, 8), line(15, 8, 16.9, 10.3)), true);
        x("lichtcircuit", "Lichtcircuit", O, EL, all(lamp(12, 12, 7), of(circle(12, 12, 10))), true);
        x("aftakdoos", "Aftakdoos", G, EL, of(circle(12, 12, 8), dot(12, 12, 2.6)), true);
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