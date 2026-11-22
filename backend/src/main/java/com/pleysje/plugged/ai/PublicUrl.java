// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * The address at which the AI assistants reach Plugged, such as https://plugged.example.be: plugged.public-url (env var PLUGGED_PUBLIC_URL)
 * when set, else the address of the request (behind a reverse proxy its X-Forwarded headers count, see server.forward-headers-strategy).
 * The MCP endpoint is this address + /mcp, and it is what the user enters in his assistant.
 */
@Component
public class PublicUrl {
    private final String configured;

    public PublicUrl(@Value("${plugged.public-url:}") String configured) {
        String clean = configured == null ? "" : configured.trim();
        this.configured = clean.endsWith("/") ? clean.substring(0, clean.length() - 1) : clean;
    }

    public String base(HttpServletRequest request) {
        if (!configured.isEmpty()) return configured;
        return ServletUriComponentsBuilder.fromContextPath(request).replaceQuery(null).build().toUriString();
    }

    public String mcp(HttpServletRequest request) {
        return base(request) + McpController.PATH;
    }

    public String resourceMetadata(HttpServletRequest request) {
        return base(request) + "/.well-known/oauth-protected-resource" + McpController.PATH;
    }
}
