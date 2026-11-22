// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import com.pleysje.plugged.entity.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The MCP endpoint (Model Context Protocol, Streamable HTTP transport): an AI assistant of the user (Claude, ChatGPT, Claude Code, ...) calls
 * the tools of {@link McpTools} here, as that user. POST /mcp with one JSON-RPC message; every answer is plain JSON (no event stream, no
 * sessions: every request stands on its own). GET and DELETE /mcp answer 405.
 * <p>
 * Every request needs "Authorization: Bearer" with an access key of an OAuth connection or a personal key ({@link AiAuthService}); without
 * one the answer is 401 with the address of the protected-resource metadata, which starts the sign-in of the assistant. A request from a web
 * page of another site (an Origin header that is not this server) is refused.
 */
@RestController
public class McpController {
    private static final Logger log = LoggerFactory.getLogger(McpController.class);
    public static final String PATH = "/mcp";
    /** The versions of the protocol this server speaks, newest first. */
    static final List<String> PROTOCOL_VERSIONS = List.of("2025-11-25", "2025-06-18", "2025-03-26");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final AiAuthService auth;
    private final McpTools tools;
    private final PublicUrl publicUrl;

    /** The version of Plugged: that of backend/pom.xml, through META-INF/build-info.properties of the build ("dev" without it). */
    private final String pluggedVersion;

    public McpController(AiAuthService auth, McpTools tools, PublicUrl publicUrl,
                         java.util.Optional<org.springframework.boot.info.BuildProperties> build) {
        this.pluggedVersion = build.map(org.springframework.boot.info.BuildProperties::getVersion).orElse("dev");
        this.auth = auth;
        this.tools = tools;
        this.publicUrl = publicUrl;
    }

    @PostMapping(value = PATH, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> post(@RequestBody(required = false) String body, @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
                                  @RequestHeader(value = HttpHeaders.ORIGIN, required = false) String origin, HttpServletRequest request) {
        if (origin != null && !origin.equals(publicUrl.base(request))) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        AppUser user = authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7) ? auth.userOf(authorization.substring(7)).orElse(null) : null;
        if (user == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer resource_metadata=\"" + publicUrl.resourceMetadata(request) + "\", scope=\"" + AiAuthController.SCOPE + "\"")
                    .build();
        JsonNode message;
        try {
            message = JSON.readTree(body == null ? "" : body);
        } catch (Exception invalid) {
            return ResponseEntity.badRequest().body(error(null, -32700, "Parse error"));
        }
        if (message == null || !message.isObject()) return ResponseEntity.badRequest().body(error(null, -32600, "Invalid Request: one JSON-RPC message expected"));
        JsonNode id = message.get("id");
        String method = message.path("method").asString("");
        // a notification (no id) or an answer of the client: nothing to answer
        if (id == null || id.isNull()) return ResponseEntity.accepted().build();
        JsonNode params = message.path("params");
        try {
            Object result = switch (method) {
                case "initialize" -> initialize(params, request);
                case "ping" -> Map.of();
                case "tools/list" -> Map.of("tools", McpTools.DEFINITIONS);
                case "tools/call" -> tools.call(user, params.path("name").asString(""), params.path("arguments"), request);
                default -> null;
            };
            if (result == null) return ResponseEntity.ok(error(id, -32601, "Method not found: " + method));
            ObjectNode answer = JSON.createObjectNode();
            answer.put("jsonrpc", "2.0");
            answer.set("id", id);
            answer.set("result", JSON.valueToTree(result));
            return ResponseEntity.ok(answer);
        } catch (McpTools.UnknownToolException unknown) {
            return ResponseEntity.ok(error(id, -32602, unknown.getMessage()));
        } catch (RuntimeException failure) {
            log.warn("MCP {} failed for user {}: {}", method, user.getId(), failure.toString());
            return ResponseEntity.ok(error(id, -32603, "Internal error"));
        }
    }

    private Map<String, Object> initialize(JsonNode params, HttpServletRequest request) {
        String asked = params.path("protocolVersion").asString("");
        String version = PROTOCOL_VERSIONS.contains(asked) ? asked : PROTOCOL_VERSIONS.get(0);
        return Map.of("protocolVersion", version,
                "capabilities", Map.of("tools", Map.of("listChanged", false)),
                "serverInfo", Map.of("name", "plugged", "title", "Plugged", "version", pluggedVersion, "websiteUrl", publicUrl.base(request)),
                "instructions", McpTools.instructions());
    }

    /** No event stream and no sessions on this server. */
    @GetMapping(PATH)
    public ResponseEntity<Void> get() {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).header(HttpHeaders.ALLOW, "POST").build();
    }

    @DeleteMapping(PATH)
    public ResponseEntity<Void> delete() {
        return get();
    }

    private static ObjectNode error(JsonNode id, int code, String message) {
        ObjectNode answer = JSON.createObjectNode();
        answer.put("jsonrpc", "2.0");
        if (id == null) answer.putNull("id");
        else answer.set("id", id);
        ObjectNode error = answer.putObject("error");
        error.put("code", code);
        error.put("message", message);
        return answer;
    }
}
