// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A key with which an AI assistant works in Plugged as one user. Only a hash (SHA-256) of the key is stored: the key itself is shown once.
 * <ul>
 *   <li>ACCESS: from the OAuth sign-in of an assistant (short-lived), REFRESH: to get a new ACCESS key (rotated: every use gives a new
 *       one and the old one stops working). Both belong to one connection ({@code grant}): removing the connection removes both.</li>
 *   <li>PERSONAL: a key the user made himself (Account → AI-assistent) for an assistant that is set up with a fixed key; it works until he
 *       removes it or it expires.</li>
 * </ul>
 */
@Entity
@Table(name = "ai_tokens", indexes = {@Index(name = "ai_tokens_user", columnList = "user_id"), @Index(name = "ai_tokens_grant", columnList = "grant_id")})
public class AiToken {
    public enum Kind { ACCESS, REFRESH, PERSONAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 64)
    private String hash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Kind kind;
    @Column(name = "user_id", nullable = false)
    private long userId;
    /** The connection (OAuth) this key belongs to; for a personal key its own id. */
    @Column(name = "grant_id", nullable = false, length = 32)
    private String grant;
    /** The assistant (client_id) of an OAuth key, null for a personal key. */
    @Column(name = "client_id", length = 64)
    private String clientId;
    /** What the user sees: the name of the assistant, or the name he gave his personal key. */
    @Column(nullable = false, length = 200)
    private String name;
    @Column(length = 40)
    private String expires;
    @Column(nullable = false, length = 40)
    private String created;
    @Column(name = "last_used", length = 40)
    private String lastUsed;

    protected AiToken() {
    }

    public AiToken(String hash, Kind kind, long userId, String grant, String clientId, String name, Instant expires) {
        this.hash = hash;
        this.kind = kind;
        this.userId = userId;
        this.grant = grant;
        this.clientId = clientId;
        this.name = name;
        this.expires = expires == null ? null : expires.toString();
        this.created = Instant.now().toString();
    }

    public boolean expiredAt(Instant now) {
        return expires != null && Instant.parse(expires).isBefore(now);
    }

    public Long getId() { return id; }
    public String getHash() { return hash; }
    public Kind getKind() { return kind; }
    public long getUserId() { return userId; }
    public String getGrant() { return grant; }
    public String getClientId() { return clientId; }
    public String getName() { return name; }
    public String getExpires() { return expires; }
    public String getCreated() { return created; }
    public String getLastUsed() { return lastUsed; }
    public void setLastUsed(String lastUsed) { this.lastUsed = lastUsed; }
}
