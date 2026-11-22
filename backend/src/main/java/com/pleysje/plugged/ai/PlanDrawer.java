// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Draws floor plans that an AI assistant describes in real metres on the situatieschema of a project (MCP tool draw_floor_plan), the way
 * the templates of the editor do it (frontend model/planTemplates.js): one page per floor, all floors at the same place and scale.
 * <ul>
 *   <li>rooms {name, x, y, w, h}: rectangles; their edges become walls (shared and touching edges merged into one wall), their name a text
 *       in the middle that shows the floor area under it;</li>
 *   <li>walls {x1, y1, x2, y2}: walls that are not the edge of a rectangular room (a slanted wall, an L-shaped room);</li>
 *   <li>doors and windows {x, y, rotation 0 (on a horizontal wall) or 90, width, flip, mirror}; passages {x, y, rotation, width}: an opening
 *       without a door, cut out of the room edges;</li>
 *   <li>symbols {type, x, y, rotation, mark}: a symbol of the library (a key that can be placed on the plan) with its circuit and point, such
 *       as "B4"; the editor makes the eendraadschema from those marks;</li>
 *   <li>texts {text, x, y, size, area}.</li>
 * </ul>
 * x goes to the right and y down, from the top left corner of the building. The drawing is centred in the drawing area of the A4 sheet
 * (above the title block) at the largest standard scale it fits at, unless the project already has a drawing on its situatieschema: then
 * its scale stays (the scale is one for the whole project) and a plan that does not fit is refused.
 */
final class PlanDrawer {
    /** The part of the A4 sheet (mm) a plan is centred in: TEMPLATE_AREA of the editor. */
    static final double AREA_X = 10, AREA_Y = 8, AREA_W = 277, AREA_H = 170;
    static final int[] STANDARD_SCALES = {20, 25, 40, 50, 75, 100, 125, 150, 200};
    static final double SYMBOL_SIZE = 7, TEXT_WIDTH_FACTOR = 0.55, MAX_METRES = 500;
    static final int MAX_FLOORS = 10, MAX_PER_KIND = 1000;
    private static final Pattern MARK = Pattern.compile("^\\s*[A-Za-z]{1,3}\\s*[-.]?\\s*\\d{1,3}\\s*$");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    /** A refused plan: the message tells the assistant what to change. */
    static class PlanException extends RuntimeException {
        PlanException(String message) {
            super(message);
        }
    }

    record Result(int scale, boolean scaleChanged, List<String> pageNames, int symbols, int marked, List<String> warnings) {
    }

    private PlanDrawer() {
    }

    /**
     * Adds the floors to {@code document} (changed in place). placeable: the symbol keys that can stand on a plan. replace: the floors replace
     * the pages of the situatieschema (else they replace them only when those are all empty, and are added after them otherwise).
     */
    static Result draw(ObjectNode document, JsonNode floors, Set<String> placeable, boolean replace) {
        if (floors == null || !floors.isArray() || floors.isEmpty()) throw new PlanException("floors: give at least one floor");
        if (floors.size() > MAX_FLOORS) throw new PlanException("floors: at most " + MAX_FLOORS);
        List<String> warnings = new ArrayList<>();
        // the box around everything, over all floors: every floor at the same place on its page
        double[] box = {Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (JsonNode floor : floors) {
            for (JsonNode room : list(floor, "rooms")) {
                double x = number(room, "x"), y = number(room, "y"), w = positive(room, "w"), h = positive(room, "h");
                extend(box, x, y);
                extend(box, x + w, y + h);
            }
            for (JsonNode wall : list(floor, "walls")) {
                extend(box, number(wall, "x1"), number(wall, "y1"));
                extend(box, number(wall, "x2"), number(wall, "y2"));
            }
            for (String kind : List.of("doors", "windows", "passages", "symbols", "texts"))
                for (JsonNode item : list(floor, kind)) extend(box, number(item, "x"), number(item, "y"));
        }
        if (box[0] > box[2]) throw new PlanException("nothing to draw: give rooms, walls or symbols");
        double width = Math.max(box[2] - box[0], 0.1), height = Math.max(box[3] - box[1], 0.1);
        if (width > MAX_METRES || height > MAX_METRES) throw new PlanException("the plan is larger than " + MAX_METRES + " m: are the coordinates in metres?");

        ObjectNode footer = document.has("footer") && document.get("footer").isObject() ? (ObjectNode) document.get("footer") : document.putObject("footer");
        ArrayNode pages = document.has("sit") && document.get("sit").isArray() ? (ArrayNode) document.get("sit") : document.putArray("sit");
        boolean drawn = false;
        for (JsonNode page : pages) drawn |= !page.path("walls").isEmpty() || !page.path("items").isEmpty();
        int current = scaleOf(footer.path("schaal").asString("")), scale;
        boolean fresh = replace || !drawn;
        if (!fresh) {
            if (!fits(width, height, current))
                throw new PlanException("the plan (" + round(width) + " x " + round(height) + " m) does not fit on a sheet at the scale of this project (1:" + current
                        + "), and the project already has drawings at that scale. Draw it in a new project, or with replace: true.");
            scale = current;
        } else {
            scale = 0;
            for (int candidate : STANDARD_SCALES)
                if (fits(width, height, candidate)) {
                    scale = candidate;
                    break;
                }
            if (scale == 0) throw new PlanException("the plan (" + round(width) + " x " + round(height) + " m) is too large for a sheet even at 1:200");
            footer.put("schaal", "1:" + scale);
        }
        double left = AREA_X + (AREA_W - sheet(width, scale)) / 2 - sheet(box[0], scale), top = AREA_Y + (AREA_H - sheet(height, scale)) / 2 - sheet(box[1], scale);

        List<ObjectNode> newPages = new ArrayList<>();
        List<String> names = new ArrayList<>();
        int symbols = 0, marked = 0, floorNumber = 0;
        for (JsonNode floor : floors) {
            floorNumber++;
            ObjectNode page = NODES.objectNode();
            page.put("id", newId());
            String name = floor.path("name").asString("").strip();
            page.put("name", name.isEmpty() ? "Plan " + floorNumber : limit(name, 60));
            names.add(page.get("name").asString());
            ArrayNode walls = page.putArray("walls"), items = page.putArray("items");
            List<double[]> rooms = new ArrayList<>(), passages = new ArrayList<>();
            for (JsonNode room : list(floor, "rooms"))
                rooms.add(new double[] {number(room, "x"), number(room, "y"), positive(room, "w"), positive(room, "h")});
            for (JsonNode passage : list(floor, "passages"))
                passages.add(new double[] {number(passage, "x"), number(passage, "y"), rotation(passage), positive(passage, "width")});
            for (double[] wall : roomWalls(rooms, passages)) walls.add(wall(wall[0], wall[1], wall[2], wall[3], left, top, scale));
            for (JsonNode wall : list(floor, "walls"))
                walls.add(wall(number(wall, "x1"), number(wall, "y1"), number(wall, "x2"), number(wall, "y2"), left, top, scale));
            for (String kind : List.of("doors", "windows"))
                for (JsonNode opening : list(floor, kind)) {
                    ObjectNode item = items.addObject();
                    item.put("id", newId());
                    item.put("kind", kind.equals("doors") ? "door" : "window");
                    item.put("x", round(left + sheet(number(opening, "x"), scale)));
                    item.put("y", round(top + sheet(number(opening, "y"), scale)));
                    item.put("r", rotation(opening));
                    item.put("w", round(sheet(positive(opening, "width"), scale)));
                    if (opening.path("flip").asBoolean(false)) item.put("f", true);
                    if (opening.path("mirror").asBoolean(false)) item.put("m", true);
                }
            int index = 0;
            for (JsonNode room : list(floor, "rooms")) {
                double[] r = rooms.get(index++);
                String text = room.path("name").asString("").strip();
                if (text.isEmpty()) continue;
                text = limit(text, 60);
                double size = sheet(r[2], scale) < text.length() * 4 * TEXT_WIDTH_FACTOR + 4 ? 3 : 4;
                double cx = left + sheet(r[0] + r[2] / 2, scale), cy = top + sheet(r[1] + r[3] / 2, scale);
                items.add(text(text, cx - text.length() * size * TEXT_WIDTH_FACTOR / 2, cy + size * 0.35, size, true));
            }
            for (JsonNode label : list(floor, "texts")) {
                String text = label.path("text").asString("").strip();
                if (text.isEmpty()) continue;
                double size = label.has("size") ? Math.max(2, Math.min(12, label.path("size").asDouble(4))) : 4;
                items.add(text(limit(text, 120), left + sheet(number(label, "x"), scale), top + sheet(number(label, "y"), scale), size,
                        label.path("area").asBoolean(false)));
            }
            for (JsonNode symbol : list(floor, "symbols")) {
                String type = symbol.path("type").asString("");
                if (!placeable.contains(type)) {
                    warnings.add("symbol type \"" + limit(type, 60) + "\" is not a symbol that can be placed on a plan: left out (see list_symbols)");
                    continue;
                }
                ObjectNode item = items.addObject();
                item.put("id", newId());
                item.put("kind", "sym");
                item.put("type", type);
                item.put("x", round(left + sheet(number(symbol, "x"), scale)));
                item.put("y", round(top + sheet(number(symbol, "y"), scale)));
                item.put("r", ((symbol.path("rotation").asInt(0) % 360) + 360) % 360);
                item.put("s", SYMBOL_SIZE);
                String mark = symbol.path("mark").asString("").strip();
                if (!mark.isEmpty()) {
                    if (MARK.matcher(mark).matches()) {
                        item.put("mark", mark.toUpperCase(java.util.Locale.ROOT).replaceAll("\\s", ""));
                        marked++;
                    } else warnings.add("mark \"" + limit(mark, 20) + "\" is not a circuit and point such as B4: left out");
                }
                symbols++;
            }
            if (walls.size() > MAX_PER_KIND || items.size() > MAX_PER_KIND) throw new PlanException("floor " + floorNumber + ": at most " + MAX_PER_KIND + " walls and items");
            newPages.add(page);
        }
        if (fresh) pages.removeAll();
        newPages.forEach(pages::add);
        return new Result(scale, fresh && scale != current, names, symbols, marked, warnings);
    }

    /** The walls of the rooms: their edges, collinear edges that overlap or touch merged, minus the passages (roomWalls of the editor). */
    static List<double[]> roomWalls(List<double[]> rooms, List<double[]> passages) {
        Map<Double, List<double[]>> horizontal = new TreeMap<>(), vertical = new TreeMap<>();
        for (double[] room : rooms) {
            double x = room[0], y = room[1], w = room[2], h = room[3];
            add(horizontal, y, x, x + w);
            add(horizontal, y + h, x, x + w);
            add(vertical, x, y, y + h);
            add(vertical, x + w, y, y + h);
        }
        List<double[]> walls = new ArrayList<>();
        horizontal.forEach((y, spans) -> cut(merged(spans), gaps(passages, false, y)).forEach(span -> walls.add(new double[] {span[0], y, span[1], y})));
        vertical.forEach((x, spans) -> cut(merged(spans), gaps(passages, true, x)).forEach(span -> walls.add(new double[] {x, span[0], x, span[1]})));
        return walls;
    }

    private static void add(Map<Double, List<double[]>> lines, double at, double from, double to) {
        lines.computeIfAbsent(round(at), key -> new ArrayList<>()).add(new double[] {round(Math.min(from, to)), round(Math.max(from, to))});
    }

    private static List<double[]> merged(List<double[]> spans) {
        List<double[]> sorted = new ArrayList<>(spans);
        sorted.sort((a, b) -> Double.compare(a[0], b[0]));
        List<double[]> result = new ArrayList<>();
        for (double[] span : sorted) {
            double[] last = result.isEmpty() ? null : result.get(result.size() - 1);
            if (last != null && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
            else result.add(span.clone());
        }
        return result;
    }

    private static List<double[]> gaps(List<double[]> passages, boolean vertical, double at) {
        List<double[]> result = new ArrayList<>();
        for (double[] passage : passages)
            if ((passage[2] == 90) == vertical && round(vertical ? passage[0] : passage[1]) == at) {
                double centre = vertical ? passage[1] : passage[0];
                result.add(new double[] {round(centre - passage[3] / 2), round(centre + passage[3] / 2)});
            }
        return result;
    }

    private static List<double[]> cut(List<double[]> spans, List<double[]> gaps) {
        List<double[]> result = spans;
        for (double[] gap : gaps) {
            List<double[]> next = new ArrayList<>();
            for (double[] span : result) {
                if (gap[1] <= span[0] || gap[0] >= span[1]) next.add(span);
                else {
                    if (gap[0] > span[0]) next.add(new double[] {span[0], gap[0]});
                    if (gap[1] < span[1]) next.add(new double[] {gap[1], span[1]});
                }
            }
            result = next;
        }
        return result;
    }

    private static ObjectNode wall(double x1, double y1, double x2, double y2, double left, double top, int scale) {
        ObjectNode wall = NODES.objectNode();
        wall.put("id", newId());
        wall.put("x1", round(left + sheet(x1, scale)));
        wall.put("y1", round(top + sheet(y1, scale)));
        wall.put("x2", round(left + sheet(x2, scale)));
        wall.put("y2", round(top + sheet(y2, scale)));
        return wall;
    }

    private static ObjectNode text(String text, double x, double y, double size, boolean area) {
        ObjectNode item = NODES.objectNode();
        item.put("id", newId());
        item.put("kind", "text");
        item.put("x", round(x));
        item.put("y", round(y));
        item.put("txt", text);
        item.put("s", size);
        item.put("r", 0);
        if (area) item.put("area", true);
        return item;
    }

    static boolean fits(double width, double height, int scale) {
        return sheet(width, scale) <= AREA_W && sheet(height, scale) <= AREA_H;
    }

    /** "1:50" → 50 (else 50, as the editor does). */
    static int scaleOf(String text) {
        var match = Pattern.compile("^\\s*1\\s*[:/]\\s*(\\d+(?:[.,]\\d+)?)\\s*$").matcher(text);
        if (!match.matches()) return 50;
        double value = Double.parseDouble(match.group(1).replace(',', '.'));
        return value > 0 ? (int) Math.round(value) : 50;
    }

    private static double sheet(double metres, int scale) {
        return metres * 1000 / scale;
    }

    private static void extend(double[] box, double x, double y) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
    }

    private static Iterable<JsonNode> list(JsonNode floor, String name) {
        JsonNode value = floor.path(name);
        if (value.isMissingNode() || value.isNull()) return List.of();
        if (!value.isArray()) throw new PlanException(name + ": a list expected");
        if (value.size() > MAX_PER_KIND) throw new PlanException(name + ": at most " + MAX_PER_KIND);
        return value;
    }

    private static double number(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isNumber() || !Double.isFinite(value.asDouble())) throw new PlanException(field + ": a number (metres) expected in " + node);
        double number = value.asDouble();
        if (Math.abs(number) > MAX_METRES) throw new PlanException(field + ": " + number + " m is too far: coordinates are in metres");
        return number;
    }

    private static double positive(JsonNode node, String field) {
        double value = number(node, field);
        if (value <= 0) throw new PlanException(field + ": a positive length (metres) expected in " + node);
        return value;
    }

    private static int rotation(JsonNode node) {
        int rotation = node.path("rotation").asInt(0);
        if (rotation != 0 && rotation != 90) throw new PlanException("rotation: 0 (on a horizontal wall) or 90 (on a vertical wall) expected in " + node);
        return rotation;
    }

    static double round(double value) {
        return Math.round(value * 1000) / 1000.0;
    }

    private static String limit(String text, int length) {
        String clean = text.replaceAll("\\p{Cntrl}", " ");
        return clean.length() > length ? clean.substring(0, length) : clean;
    }

    static String newId() {
        String alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder id = new StringBuilder(7);
        for (int i = 0; i < 7; i++) id.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        return id.toString();
    }
}
