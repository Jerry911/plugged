// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.service.GroupService;
import com.pleysje.plugged.service.ProjectService;
import com.pleysje.plugged.service.SymbolService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The tools an AI assistant calls through the MCP endpoint (McpController), always as the user the key belongs to and with exactly his
 * rights (ProjectService and SymbolService decide). Their descriptions are in resources/ai/tools.json, what the assistant reads first in
 * ai/instructions.md and ai/guide.md.
 * A student in educational mode cannot use them (an assistant that draws for him would be an import).
 * A tool that cannot do what was asked answers with isError and a message in English the assistant can act on.
 */
@Service
public class McpTools {
    private static final Logger log = LoggerFactory.getLogger(McpTools.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    static final List<Map<String, Object>> DEFINITIONS = JSON.readValue(resource("ai/tools.json"), new TypeReference<>() {});
    static final Set<String> TITLE_BLOCK_FIELDS = Set.of("straat", "nr", "postcode", "gemeente", "eigenaar", "ean", "tekenaar", "rev", "dossier", "stelsel",
            "installatiedatum");
    private static final Set<String> NAMES = DEFINITIONS.stream().map(tool -> (String) tool.get("name")).collect(Collectors.toSet());

    /** A tool that does not exist (a JSON-RPC error, not a tool error). */
    static class UnknownToolException extends RuntimeException {
        UnknownToolException(String name) {
            super("Unknown tool: " + name);
        }
    }

    /** What a tool refuses: the message for the assistant. */
    private static class Refused extends RuntimeException {
        Refused(String message) {
            super(message);
        }
    }

    private final ProjectService projects;
    private final SymbolService symbols;
    private final GroupService groups;
    private final PublicUrl publicUrl;
    private final MessageSource messages;

    public McpTools(ProjectService projects, SymbolService symbols, GroupService groups, PublicUrl publicUrl, MessageSource messages) {
        this.projects = projects;
        this.symbols = symbols;
        this.groups = groups;
        this.publicUrl = publicUrl;
        this.messages = messages;
    }

    static String instructions() {
        return resource("ai/instructions.md");
    }

    /** The answer of tools/call: {content: [{type: text, text}], structuredContent, isError}. */
    Map<String, Object> call(AppUser user, String name, JsonNode arguments, HttpServletRequest request) {
        if (!NAMES.contains(name)) throw new UnknownToolException(name);
        if (groups.isRestricted(user)) return failure("This account is in educational mode: the teacher does not allow an AI assistant to draw in it.");
        JsonNode args = arguments == null || arguments.isMissingNode() || arguments.isNull() ? JSON.createObjectNode() : arguments;
        try {
            Object result = switch (name) {
                case "plugged_guide" -> resource("ai/guide.md");
                case "list_projects" -> listProjects(user);
                case "get_project" -> getProject(user, id(args), request);
                case "list_symbols" -> listSymbols(user, args.path("where").asString("plan"), args.path("search").asString(""));
                case "create_project" -> createProject(user, args, request);
                case "draw_floor_plan" -> drawFloorPlan(user, args, request);
                case "save_project" -> saveProject(user, args, request);
                default -> throw new UnknownToolException(name);
            };
            log.info("AI assistant of user {} used {}", user.getId(), name);
            return success(result);
        } catch (Refused | PlanDrawer.PlanException refused) {
            return failure(refused.getMessage());
        } catch (LocalizedStatusException refused) {
            return failure(messages.getMessage(refused, Locale.ENGLISH));
        }
    }

    private List<Map<String, Object>> listProjects(AppUser user) {
        return projects.summaries(user.getId()).stream()
                .sorted((a, b) -> String.valueOf(b.updated()).compareTo(String.valueOf(a.updated())))
                .map(summary -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", summary.id());
                    row.put("name", summary.name() == null ? "" : summary.name());
                    row.put("updated", summary.updated());
                    row.put("mine", summary.mine());
                    if (!summary.mine() && summary.owner() != null) row.put("owner", summary.owner().name());
                    return row;
                }).toList();
    }

    private Map<String, Object> getProject(AppUser user, long id, HttpServletRequest request) {
        ProjectService.Document document = projects.document(user.getId(), id);
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("id", id);
        answer.put("version", document.version());
        answer.put("url", link(request, id));
        answer.put("document", Underlays.strip(JSON.readTree(document.json())));
        return answer;
    }

    private List<Map<String, Object>> listSymbols(AppUser user, String where, String search) {
        String[] words = search.toLowerCase(Locale.ROOT).trim().split("\\s+");
        return symbols.list(user.getId()).stream()
                .filter(symbol -> switch (where) {
                    case "one_wire" -> !Boolean.FALSE.equals(symbol.oneWire()) && symbol.parents() != null && !symbol.parents().isEmpty();
                    case "wiring" -> Boolean.TRUE.equals(symbol.wiring());
                    default -> isPlaceable(symbol);
                })
                .filter(symbol -> {
                    String text = (symbol.key() + " " + symbol.name() + " " + symbol.category()).toLowerCase(Locale.ROOT);
                    for (String word : words) if (!word.isEmpty() && !text.contains(word)) return false;
                    return true;
                })
                .map(symbol -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("key", symbol.key());
                    row.put("name", symbol.name());
                    row.put("category", symbol.category());
                    return row;
                }).toList();
    }

    /** Can stand on the situatieschema: placeable and not only a symbol of the bedradingsschema. */
    private static boolean isPlaceable(SymbolDto symbol) {
        return !Boolean.FALSE.equals(symbol.placeable()) && !(Boolean.TRUE.equals(symbol.wiring()) && Boolean.FALSE.equals(symbol.oneWire()));
    }

    private Map<String, Object> createProject(AppUser user, JsonNode args, HttpServletRequest request) {
        String name = args.path("name").asString("").strip();
        if (name.isEmpty()) throw new Refused("name: give the project a name");
        String language = args.path("language").asString("nl");
        if (!List.of("nl", "fr", "en").contains(language)) language = "nl";
        ObjectNode document = (ObjectNode) JSON.readTree(resource("ai/new-project-" + language + ".json"));
        ObjectNode footer = (ObjectNode) document.get("footer");
        footer.put("datum", LocalDate.now(ZoneId.of("Europe/Brussels")).toString());
        JsonNode block = args.path("title_block");
        if (block.isObject())
            for (var field : block.properties())
                if (TITLE_BLOCK_FIELDS.contains(field.getKey()) && field.getValue().isValueNode())
                    footer.put(field.getKey(), limit(field.getValue().asString(""), 200));
        document.put("name", limit(name, 200));
        ProjectSummary.Created created = projects.create(user.getId(), JSON.writeValueAsString(document), limit(name, 200));
        return Map.of("id", created.id(), "version", created.version(), "url", link(request, created.id()));
    }

    private Map<String, Object> drawFloorPlan(AppUser user, JsonNode args, HttpServletRequest request) {
        long id = id(args);
        ProjectService.Document current = projects.document(user.getId(), id);
        long version = args.hasNonNull("version") ? args.path("version").asLong() : current.version();
        if (version != current.version())
            throw new Refused("project " + id + " was saved since you read it (now version " + current.version() + "): read it again with get_project");
        JsonNode parsed = JSON.readTree(current.json());
        if (!(parsed instanceof ObjectNode document)) throw new Refused("project " + id + " is not a project document");
        Set<String> placeable = symbols.list(user.getId()).stream().filter(McpTools::isPlaceable).map(SymbolDto::key).collect(Collectors.toSet());
        PlanDrawer.Result result = PlanDrawer.draw(document, args.path("floors"), placeable, args.path("replace").asBoolean(false));
        boolean generate = args.path("make_one_wire").asBoolean(true) && result.marked() > 0;
        if (generate) document.putObject("pending").put("generateOneWire", true);
        String name = document.path("name").isString() ? document.path("name").asString() : null;
        long saved = projects.save(user.getId(), id, version, JSON.writeValueAsString(document), name);
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("version", saved);
        answer.put("pages", result.pageNames());
        answer.put("scale", "1:" + result.scale());
        answer.put("symbols", result.symbols());
        answer.put("marked", result.marked());
        answer.put("url", link(request, id));
        List<String> next = new ArrayList<>(result.warnings());
        if (result.scaleChanged()) next.add("the scale of the project is now 1:" + result.scale());
        next.add(generate ? "When the user opens the project, Plugged offers to make the eendraadschema from the marks."
                : "No marked symbols: the eendraadschema is not made from this plan.");
        answer.put("notes", next);
        return answer;
    }

    private Map<String, Object> saveProject(AppUser user, JsonNode args, HttpServletRequest request) {
        long id = id(args);
        if (!args.path("version").isNumber()) throw new Refused("version: the version you read with get_project");
        JsonNode document = args.path("document");
        if (!document.isObject()) throw new Refused("document: the complete project document (a JSON object)");
        String name = document.path("name").isString() ? limit(document.path("name").asString(), 200) : null;
        // the plans behind the pages were not shown (Underlays.strip): they come back from the stored project
        Underlays.restore(document, JSON.readTree(projects.document(user.getId(), id).json()));
        long saved = projects.save(user.getId(), id, args.path("version").asLong(), JSON.writeValueAsString(document), name);
        return Map.of("version", saved, "url", link(request, id));
    }

    private static long id(JsonNode args) {
        JsonNode id = args.path("project_id");
        if (!id.canConvertToLong()) throw new Refused("project_id: the id of a project (list_projects)");
        return id.asLong();
    }

    private String link(HttpServletRequest request, long id) {
        return publicUrl.base(request) + "/?project=" + id;
    }

    private static Map<String, Object> success(Object result) {
        Map<String, Object> answer = new LinkedHashMap<>();
        String text = result instanceof String plain ? plain : JSON.writeValueAsString(result);
        answer.put("content", List.of(Map.of("type", "text", "text", text)));
        if (result instanceof Map<?, ?>) answer.put("structuredContent", result);
        answer.put("isError", false);
        return answer;
    }

    private static Map<String, Object> failure(String message) {
        return Map.of("content", List.of(Map.of("type", "text", "text", message)), "isError", true);
    }

    private static String limit(String text, int length) {
        String clean = text.replaceAll("\\p{Cntrl}", " ").strip();
        return clean.length() > length ? clean.substring(0, length) : clean;
    }

    static String resource(String path) {
        try (InputStream input = new ClassPathResource(path).getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException missing) {
            throw new UncheckedIOException(missing);
        }
    }
}
