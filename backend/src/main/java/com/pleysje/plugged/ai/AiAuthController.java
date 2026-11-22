// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The AI link: how an AI assistant of the user (Claude, ChatGPT, ...) gets the right to work in Plugged as him (OAuth 2.1 with PKCE, see
 * {@link AiAuthService}), and his own overview.
 * <ul>
 *   <li>GET /.well-known/oauth-protected-resource[/mcp]: who protects the MCP endpoint (RFC 9728); GET /.well-known/oauth-authorization-server:
 *       the addresses below (RFC 8414)</li>
 *   <li>POST /oauth/register: an assistant registers itself (RFC 7591)</li>
 *   <li>GET /oauth/authorize: the page where the signed-in user agrees (the editor shows it, see frontend features/ai/ConsentPage.jsx);
 *       it asks GET /api/ai/authorize?client_id=&amp;redirect_uri= who asks, and POST /api/ai/authorize sends his answer</li>
 *   <li>POST /oauth/token: code or refresh key → keys (form fields, RFC 6749)</li>
 *   <li>GET /api/ai: the address to enter in the assistant and the connections and personal keys of the user; POST /api/ai/keys {name,
 *       days}: a new personal key (shown once); DELETE /api/ai/connections/{id}: ends a connection or key</li>
 * </ul>
 */
@Controller
public class AiAuthController {
    private static final Logger log = LoggerFactory.getLogger(AiAuthController.class);
    static final String SCOPE = "plugged";

    private final AiAuthService service;
    private final PublicUrl publicUrl;

    public AiAuthController(AiAuthService service, PublicUrl publicUrl) {
        this.service = service;
        this.publicUrl = publicUrl;
    }

    @GetMapping(value = {"/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource" + McpController.PATH}, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> protectedResource(HttpServletRequest request) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("resource", publicUrl.mcp(request));
        metadata.put("authorization_servers", List.of(publicUrl.base(request)));
        metadata.put("scopes_supported", List.of(SCOPE));
        metadata.put("bearer_methods_supported", List.of("header"));
        metadata.put("resource_name", "Plugged");
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1))).body(metadata);
    }

    @GetMapping(value = {"/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"}, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> authorizationServer(HttpServletRequest request) {
        String base = publicUrl.base(request);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("issuer", base);
        metadata.put("authorization_endpoint", base + "/oauth/authorize");
        metadata.put("token_endpoint", base + "/oauth/token");
        metadata.put("registration_endpoint", base + "/oauth/register");
        metadata.put("response_types_supported", List.of("code"));
        metadata.put("grant_types_supported", List.of("authorization_code", "refresh_token"));
        metadata.put("code_challenge_methods_supported", List.of("S256"));
        metadata.put("token_endpoint_auth_methods_supported", List.of("none"));
        metadata.put("scopes_supported", List.of(SCOPE, "offline_access"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1))).body(metadata);
    }

    @PostMapping(value = "/oauth/register", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return ApiLog.run(log, "POST /oauth/register", "", () -> {
            Object uris = body.get("redirect_uris");
            List<String> redirectUris = uris instanceof List<?> list && list.stream().allMatch(String.class::isInstance)
                    ? list.stream().map(String.class::cast).toList() : null;
            Object name = body.get("client_name");
            AiClient client = service.register(name instanceof String text ? text : null, redirectUris, request.getRemoteAddr());
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("client_id", client.getClientId());
            answer.put("client_id_issued_at", Instant.parse(client.getCreated()).getEpochSecond());
            answer.put("client_name", client.getName());
            answer.put("redirect_uris", client.getRedirectUris());
            answer.put("grant_types", List.of("authorization_code", "refresh_token"));
            answer.put("response_types", List.of("code"));
            answer.put("token_endpoint_auth_method", "none");
            return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(answer);
        });
    }

    /** The page of agreeing is a page of the editor (it signs the user in first when needed). */
    @GetMapping("/oauth/authorize")
    public String authorizePage() {
        return "forward:/index.html";
    }

    /** Who asks to connect: {client: name, redirectHost}; 400 {error} when the request is not valid (the page then shows that, nobody is sent anywhere). */
    @GetMapping(value = "/api/ai/authorize", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public Map<String, Object> authorizeInfo(@RequestParam(name = "client_id", required = false) String clientId,
                                             @RequestParam(name = "redirect_uri", required = false) String redirectUri) {
        AiClient client = service.checkRequest(clientId, redirectUri);
        return Map.of("client", client.getName(), "redirectHost", java.net.URI.create(redirectUri).getHost());
    }

    /** The answer of the user: {redirect}: where the browser goes now (with the code, or with error=access_denied). */
    @PostMapping(value = "/api/ai/authorize", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public Map<String, Object> authorize(@RequestBody Map<String, String> body, Authentication authentication) {
        return ApiLog.run(log, "POST /api/ai/authorize", "", () -> {
            String clientId = body.get("client_id"), redirectUri = body.get("redirect_uri"), state = body.get("state");
            service.checkRequest(clientId, redirectUri);
            UriComponentsBuilder target = UriComponentsBuilder.fromUriString(redirectUri);
            if (!"true".equals(String.valueOf(body.get("approve")))) target.queryParam("error", "access_denied");
            else target.queryParam("code", service.approve(Authentications.userId(authentication), clientId, redirectUri, body.get("code_challenge"),
                    body.get("code_challenge_method")));
            if (state != null) target.queryParam("state", state);
            return Map.of("redirect", target.encode().build().toUriString());
        });
    }

    @PostMapping(value = "/oauth/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> token(@RequestParam MultiValueMap<String, String> form) {
        return ApiLog.run(log, "POST /oauth/token", "grant_type=" + form.getFirst("grant_type"), () -> {
            String grantType = form.getFirst("grant_type");
            AiAuthService.Tokens tokens;
            if ("authorization_code".equals(grantType))
                tokens = service.exchangeCode(form.getFirst("code"), form.getFirst("code_verifier"), form.getFirst("client_id"), form.getFirst("redirect_uri"));
            else if ("refresh_token".equals(grantType)) tokens = service.refresh(form.getFirst("refresh_token"), form.getFirst("client_id"));
            else throw new AiAuthService.OAuthException("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("access_token", tokens.accessToken());
            answer.put("token_type", "Bearer");
            answer.put("expires_in", tokens.expiresIn());
            answer.put("refresh_token", tokens.refreshToken());
            answer.put("scope", SCOPE);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(answer);
        });
    }

    /** What the Account page shows: the address to enter, and the connections and keys. */
    @GetMapping(value = "/api/ai", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public Map<String, Object> overview(Authentication authentication, HttpServletRequest request) {
        return Map.of("url", publicUrl.mcp(request), "connections", service.connections(Authentications.userId(authentication)),
                "keyDays", AiAuthService.PERSONAL_DAYS);
    }

    @PostMapping(value = "/api/ai/keys", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<Map<String, Object>> createKey(@RequestBody Map<String, Object> body, Authentication authentication) {
        return ApiLog.run(log, "POST /api/ai/keys", "", () -> {
            int days = body.get("days") instanceof Number number ? number.intValue() : 0;
            if (!AiAuthService.PERSONAL_DAYS.contains(days)) return ResponseEntity.badRequest().<Map<String, Object>>build();
            String key = service.createPersonalKey(Authentications.userId(authentication), body.get("name") instanceof String name ? name : null, days);
            return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(Map.<String, Object>of("key", key));
        });
    }

    @DeleteMapping("/api/ai/connections/{id}")
    @ResponseBody
    public ResponseEntity<Void> end(@PathVariable String id, Authentication authentication) {
        return ApiLog.run(log, "DELETE /api/ai/connections/{id}", "",
                () -> service.end(Authentications.userId(authentication), id) ? ResponseEntity.noContent().<Void>build() : ResponseEntity.notFound().<Void>build());
    }

    /** An OAuth error: 400 {error, error_description} (401 for an unknown client at the token endpoint). */
    @ExceptionHandler(AiAuthService.OAuthException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> refused(AiAuthService.OAuthException exception) {
        HttpStatus status = "invalid_client".equals(exception.error()) ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(Map.of("error", exception.error(), "error_description", exception.getMessage() == null ? "" : exception.getMessage()));
    }
}
