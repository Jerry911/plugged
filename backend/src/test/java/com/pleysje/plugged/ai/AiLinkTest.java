// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The AI link: an assistant registers, the user agrees, the assistant gets keys and works in Plugged through MCP as that user. */
@SpringBootTest(properties = {"plugged.admin.email=admin@example.be", "plugged.public-url=https://plugged.example.be/"})
@AutoConfigureMockMvc
class AiLinkTest {
    static final String CLAUDE = "https://claude.ai/api/mcp/auth_callback";
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final String VERIFIER = "a-verifier-of-the-assistant-that-is-long-enough-0123456789";

    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    ProjectRepository projects;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    SymbolRepository symbols;
    @Autowired
    AiTokenRepository tokens;

    AppUser alice, bob;

    @BeforeEach
    void clean() {
        tokens.deleteAll();
        com.pleysje.plugged.TestAccounts.clean(groups, projects, users, symbols);
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
    }

    static String challenge(String verifier) throws Exception {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
    }

    private JsonNode json(ResultActions result) throws Exception {
        return JSON.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private String register(String redirect) throws Exception {
        return json(mvc.perform(post("/oauth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"client_name\":\"Claude\",\"redirect_uris\":[\"" + redirect + "\"],\"token_endpoint_auth_method\":\"none\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.token_endpoint_auth_method").value("none"))).path("client_id").asString();
    }

    /** The user agrees in the editor: answers the code the assistant gets back. */
    private String approve(AppUser user, String clientId, String redirect) throws Exception {
        mvc.perform(get("/api/ai/authorize").with(as(user)).param("client_id", clientId).param("redirect_uri", redirect))
                .andExpect(status().isOk()).andExpect(jsonPath("$.client").value("Claude")).andExpect(jsonPath("$.redirectHost").value(URI.create(redirect).getHost()));
        String target = json(mvc.perform(post("/api/ai/authorize").with(as(user)).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("client_id", clientId, "redirect_uri", redirect, "state", "xyz", "approve", "true",
                        "code_challenge", challenge(VERIFIER), "code_challenge_method", "S256")))).andExpect(status().isOk())).path("redirect").asString();
        var query = UriComponentsBuilder.fromUriString(target).build().getQueryParams();
        assertTrue(target.startsWith(redirect));
        assertEquals("xyz", query.getFirst("state"));
        return query.getFirst("code");
    }

    private JsonNode token(String... form) throws Exception {
        var request = post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED);
        for (int i = 0; i < form.length; i += 2) request.param(form[i], form[i + 1]);
        return json(mvc.perform(request));
    }

    private ResultActions mcp(String key, String method, Object params) throws Exception {
        return mvc.perform(post("/mcp").header(HttpHeaders.AUTHORIZATION, "Bearer " + key).contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_EVENT_STREAM)
                .content(JSON.writeValueAsString(Map.of("jsonrpc", "2.0", "id", 1, "method", method, "params", params))));
    }

    private JsonNode tool(String key, String name, Object arguments) throws Exception {
        return json(mcp(key, "tools/call", Map.of("name", name, "arguments", arguments)).andExpect(status().isOk())).path("result");
    }

    private String connect(AppUser user) throws Exception {
        String client = register(CLAUDE);
        return token("grant_type", "authorization_code", "code", approve(user, client, CLAUDE), "code_verifier", VERIFIER, "client_id", client,
                "redirect_uri", CLAUDE).path("access_token").asString();
    }

    @Test
    void theMetadataTellsTheAssistantWhereToSignIn() throws Exception {
        mvc.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, containsString("resource_metadata=\"https://plugged.example.be/.well-known/oauth-protected-resource/mcp\"")));
        mvc.perform(get("/.well-known/oauth-protected-resource/mcp")).andExpect(status().isOk())
                .andExpect(jsonPath("$.resource").value("https://plugged.example.be/mcp"))
                .andExpect(jsonPath("$.authorization_servers[0]").value("https://plugged.example.be"));
        mvc.perform(get("/.well-known/oauth-authorization-server")).andExpect(status().isOk())
                .andExpect(jsonPath("$.issuer").value("https://plugged.example.be"))
                .andExpect(jsonPath("$.registration_endpoint").value("https://plugged.example.be/oauth/register"))
                .andExpect(jsonPath("$.code_challenge_methods_supported", contains("S256")))
                .andExpect(jsonPath("$.token_endpoint_auth_methods_supported", contains("none")));
        mvc.perform(get("/mcp")).andExpect(status().isMethodNotAllowed());
    }

    @Test
    void signingInGivesKeysThatWorkInMcpAndARefreshRotates() throws Exception {
        String client = register(CLAUDE), code = approve(alice, client, CLAUDE);
        // a wrong verifier, another client or a second use of the code: refused
        assertEquals("invalid_grant", token("grant_type", "authorization_code", "code", code, "code_verifier", "wrong-wrong-wrong-wrong-wrong-wrong-wrong-wrong",
                "client_id", client, "redirect_uri", CLAUDE).path("error").asString());
        code = approve(alice, client, CLAUDE);
        JsonNode keys = token("grant_type", "authorization_code", "code", code, "code_verifier", VERIFIER, "client_id", client, "redirect_uri", CLAUDE);
        assertEquals("Bearer", keys.path("token_type").asString());
        assertEquals("invalid_grant", token("grant_type", "authorization_code", "code", code, "code_verifier", VERIFIER, "client_id", client).path("error").asString());
        String access = keys.path("access_token").asString(), refresh = keys.path("refresh_token").asString();
        mcp(access, "initialize", Map.of("protocolVersion", "2025-06-18", "capabilities", Map.of(), "clientInfo", Map.of("name", "test", "version", "1")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.result.protocolVersion").value("2025-06-18"))
                .andExpect(jsonPath("$.result.serverInfo.name").value("plugged"))
                .andExpect(jsonPath("$.result.serverInfo.version").value(matchesPattern("\\d+\\.\\d+\\.\\d+"))).andExpect(jsonPath("$.result.instructions", containsString("AREI")));
        mcp(access, "tools/list", Map.of()).andExpect(jsonPath("$.result.tools[*].name", hasItems("draw_floor_plan", "create_project", "plugged_guide")));
        // a notification needs no answer
        mvc.perform(post("/mcp").header(HttpHeaders.AUTHORIZATION, "Bearer " + access).contentType(MediaType.APPLICATION_JSON)
                .content("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}")).andExpect(status().isAccepted());
        // refresh: new keys, the old ones stop; the old refresh key used again ends the connection
        JsonNode renewed = token("grant_type", "refresh_token", "refresh_token", refresh, "client_id", client);
        String access2 = renewed.path("access_token").asString();
        mcp(access, "ping", Map.of()).andExpect(status().isUnauthorized());
        mcp(access2, "ping", Map.of()).andExpect(status().isOk());
        assertEquals("invalid_grant", token("grant_type", "refresh_token", "refresh_token", refresh, "client_id", client).path("error").asString());
        // the user sees the connection and ends it
        JsonNode overview = json(mvc.perform(get("/api/ai").with(as(alice))).andExpect(status().isOk()));
        assertEquals("https://plugged.example.be/mcp", overview.path("url").asString());
        assertEquals(1, overview.path("connections").size());
        String id = overview.path("connections").get(0).path("id").asString();
        mvc.perform(delete("/api/ai/connections/" + id).with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/ai/connections/" + id).with(as(alice))).andExpect(status().isNoContent());
        mcp(access2, "ping", Map.of()).andExpect(status().isUnauthorized());
    }

    @Test
    void onlyRegisteredAddressesAndLoopbackOnAnyPort() throws Exception {
        mvc.perform(post("/oauth/register").contentType(MediaType.APPLICATION_JSON).content("{\"redirect_uris\":[\"http://evil.example/cb\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_redirect_uri"));
        String cli = register("http://localhost/callback");
        approve(alice, cli, "http://localhost:51234/callback");
        mvc.perform(get("/api/ai/authorize").with(as(alice)).param("client_id", cli).param("redirect_uri", "http://localhost:5/other"))
                .andExpect(status().isBadRequest());
        String web = register(CLAUDE);
        mvc.perform(get("/api/ai/authorize").with(as(alice)).param("client_id", web).param("redirect_uri", "https://claude.ai/elsewhere"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_request"));
        // no: the assistant gets access_denied
        String denied = json(mvc.perform(post("/api/ai/authorize").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("client_id", web, "redirect_uri", CLAUDE, "approve", "false"))))).path("redirect").asString();
        assertTrue(denied.contains("error=access_denied"));
        // without PKCE no code
        mvc.perform(post("/api/ai/authorize").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("client_id", web, "redirect_uri", CLAUDE, "approve", "true")))).andExpect(status().isBadRequest());
        // the page itself is the editor
        mvc.perform(get("/oauth/authorize").param("client_id", web)).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void theAssistantDrawsAFloorPlanInANewProjectOfTheUserOnly() throws Exception {
        String key = connect(alice);
        JsonNode created = tool(key, "create_project", Map.of("name", "Kerkstraat 1", "title_block", Map.of("gemeente", "Gent", "secret", "x")));
        assertFalse(created.path("isError").asBoolean());
        long id = created.path("structuredContent").path("id").asLong();
        assertEquals("https://plugged.example.be/?project=" + id, created.path("structuredContent").path("url").asString());
        Map<String, Object> floor = Map.of("name", "Gelijkvloers",
                "rooms", java.util.List.of(Map.of("name", "Living", "x", 0, "y", 0, "w", 6, "h", 4), Map.of("name", "Keuken", "x", 6, "y", 0, "w", 3, "h", 4)),
                "doors", java.util.List.of(Map.of("x", 3, "y", 4, "rotation", 0, "width", 0.9)),
                "passages", java.util.List.of(Map.of("x", 6, "y", 2, "rotation", 90, "width", 1)),
                "symbols", java.util.List.of(Map.of("type", "stopcontact_pekid", "x", 0.2, "y", 2, "mark", "a1"), Map.of("type", "lichtpunt", "x", 3, "y", 2, "mark", "B1"),
                        Map.of("type", "schakelaar", "x", 2.6, "y", 3.9, "mark", "B 1"), Map.of("type", "geen-symbool", "x", 1, "y", 1)));
        JsonNode drawn = tool(key, "draw_floor_plan", Map.of("project_id", id, "floors", java.util.List.of(floor)));
        assertFalse(drawn.path("isError").asBoolean(), drawn.toString());
        JsonNode result = drawn.path("structuredContent");
        assertEquals("1:40", result.path("scale").asString());
        assertEquals(3, result.path("symbols").asInt());
        assertEquals(3, result.path("marked").asInt());
        assertThat(result.path("notes").toString(), containsString("geen-symbool"));
        JsonNode document = tool(key, "get_project", Map.of("project_id", id)).path("structuredContent").path("document");
        assertEquals("Gent", document.path("footer").path("gemeente").asString());
        assertTrue(document.path("footer").path("secret").isMissingNode());
        assertEquals("1:40", document.path("footer").path("schaal").asString());
        assertTrue(document.path("pending").path("generateOneWire").asBoolean());
        assertEquals("aansluiting", document.path("een").get(0).path("tree").get(0).path("type").asString());
        JsonNode page = document.path("sit").get(0);
        assertEquals(1, document.path("sit").size());
        assertEquals("Gelijkvloers", page.path("name").asString());
        // top and bottom one wall each over both rooms, left and right one each, the shared wall in two pieces around the passage
        assertEquals(6, page.path("walls").size());
        assertThat(page.path("items").toString(), allOf(containsString("\"mark\":\"A1\""), containsString("\"mark\":\"B1\""), containsString("\"area\":true")));
        // Bob cannot reach it, not even with his own assistant
        String bobsKey = connect(bob);
        assertTrue(tool(bobsKey, "get_project", Map.of("project_id", id)).path("isError").asBoolean());
        assertEquals(0, tool(bobsKey, "list_projects", Map.of()).path("structuredContent").size());
        // a plan that does not fit at the scale of a project that already has a drawing is refused with a reason
        JsonNode tooLarge = tool(key, "draw_floor_plan", Map.of("project_id", id, "floors", java.util.List.of(Map.of("rooms", java.util.List.of(Map.of("x", 0, "y", 0, "w", 60, "h", 10))))));
        assertTrue(tooLarge.path("isError").asBoolean());
        assertThat(tooLarge.path("content").get(0).path("text").asString(), containsString("does not fit"));
        // the symbols of the plan
        assertThat(tool(key, "list_symbols", Map.of("search", "stopcontact")).path("content").get(0).path("text").asString(), containsString("stopcontact_pekid"));
        assertThat(tool(key, "plugged_guide", Map.of()).path("content").get(0).path("text").asString(), containsString("Mark every point"));
    }

    @Test
    void aPersonalKeyWorksUntilItIsRemovedAndANewPasswordEndsEverything() throws Exception {
        mvc.perform(post("/api/ai/keys").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Claude Code\",\"days\":7}"))
                .andExpect(status().isBadRequest());
        String key = json(mvc.perform(post("/api/ai/keys").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Claude Code\",\"days\":30}"))
                .andExpect(status().isCreated())).path("key").asString();
        assertTrue(key.startsWith("plg_"));
        mcp(key, "ping", Map.of()).andExpect(status().isOk());
        // only its hash is stored
        assertTrue(tokens.findAll().stream().noneMatch(token -> token.getHash().contains(key.substring(4, 12))));
        mvc.perform(post("/mcp").header(HttpHeaders.AUTHORIZATION, "Bearer " + key).header(HttpHeaders.ORIGIN, "https://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/auth/password").with(as(alice)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"geheim123\",\"newPassword\":\"nieuw-geheim-456\"}"));
        mcp(key, "ping", Map.of()).andExpect(status().isUnauthorized());
    }

    private static <T> void assertThat(T actual, org.hamcrest.Matcher<? super T> matcher) {
        org.hamcrest.MatcherAssert.assertThat(actual, matcher);
    }
}
