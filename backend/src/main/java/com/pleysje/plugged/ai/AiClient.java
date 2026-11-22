// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

/**
 * An AI assistant that registered itself to connect to Plugged (OAuth dynamic client registration, RFC 7591), such as Claude or ChatGPT:
 * its name and the addresses it may be sent back to after the user agreed. A public client (no secret): PKCE protects the code.
 */
@Entity
@Table(name = "ai_clients")
public class AiClient {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "client_id", nullable = false, unique = true, length = 64)
    private String clientId;
    @Column(nullable = false, length = 200)
    private String name;
    @Column(name = "redirect_uris", nullable = false, length = 4000)
    private String redirectUris;
    @Column(nullable = false, length = 40)
    private String created;

    protected AiClient() {
    }

    public AiClient(String clientId, String name, List<String> redirectUris) {
        this.clientId = clientId;
        this.name = name;
        this.redirectUris = String.join("\n", redirectUris);
        this.created = Instant.now().toString();
    }

    public Long getId() { return id; }
    public String getClientId() { return clientId; }
    public String getName() { return name; }
    public List<String> getRedirectUris() { return Arrays.stream(redirectUris.split("\n")).filter(uri -> !uri.isBlank()).toList(); }
    public String getCreated() { return created; }
}
