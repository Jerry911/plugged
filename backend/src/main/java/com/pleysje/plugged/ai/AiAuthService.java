// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.UserRepository;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may let an AI assistant work in Plugged, and as whom: the OAuth 2.1 authorization server of the AI link (see AiAuthController) and the
 * personal keys.
 * <ul>
 *   <li>An assistant registers itself ({@link #register}): its name and the addresses it may be sent back to (https, or http on this
 *       computer's loopback address for a program such as Claude Code, any port).</li>
 *   <li>The user, signed in to Plugged, agrees ({@link #approve}): a code that works once, for {@link #CODE_LIFETIME}, only for that
 *       assistant and address, and only with the PKCE verifier (S256) of the assistant.</li>
 *   <li>The code becomes an access key ({@link #ACCESS_LIFETIME}) and a refresh key ({@link #REFRESH_LIFETIME}); a refresh gives new
 *       keys and ends the old refresh key (rotation). A refresh key used a second time ends the whole connection (it was stolen).</li>
 *   <li>A personal key ({@link #createPersonalKey}) is made by the user himself for an assistant that is set up with a fixed key.</li>
 * </ul>
 * Only hashes of the keys are stored. The user sees and ends his connections and keys under Account → AI-assistent.
 */
@Service
public class AiAuthService {
    private static final Logger log = LoggerFactory.getLogger(AiAuthService.class);
    public static final Duration CODE_LIFETIME = Duration.ofMinutes(2);
    public static final Duration ACCESS_LIFETIME = Duration.ofHours(1);
    public static final Duration REFRESH_LIFETIME = Duration.ofDays(60);
    public static final List<Integer> PERSONAL_DAYS = List.of(30, 90, 365);
    static final int MAX_REDIRECT_URIS = 10, MAX_URI_LENGTH = 400, MAX_NAME_LENGTH = 100;
    /** Registrations per network address and hour (registration needs no account). */
    static final int MAX_REGISTRATIONS_PER_HOUR = 30;

    /** What a refused request answers (an OAuth error code, RFC 6749 section 5.2) and why. */
    public static class OAuthException extends RuntimeException {
        private final String error;

        public OAuthException(String error, String description) {
            super(description);
            this.error = error;
        }

        public String error() {
            return error;
        }
    }

    /** The keys of a sign-in: {access_token, refresh_token, expires_in}. */
    public record Tokens(String accessToken, String refreshToken, long expiresIn) {
    }

    /** One connection or personal key as the user sees it. */
    public record Connection(String id, String kind, String name, String created, String lastUsed, String expires) {
    }

    private record Code(long userId, String clientId, String redirectUri, String challenge, Instant expires) {
    }

    private final AiClientRepository clients;
    private final AiTokenRepository tokens;
    private final UserRepository users;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Code> codes = new ConcurrentHashMap<>();
    private final Map<String, List<Instant>> registrations = new ConcurrentHashMap<>();

    public AiAuthService(AiClientRepository clients, AiTokenRepository tokens, UserRepository users, Optional<Clock> clock) {
        this.clients = clients;
        this.tokens = tokens;
        this.users = users;
        this.clock = clock.orElse(Clock.systemUTC());
    }

    // ---------------------------------------------------------------- registration

    /** Dynamic client registration (RFC 7591): answers the new assistant. */
    @Transactional
    public AiClient register(String name, List<String> redirectUris, String address) {
        Instant now = clock.instant();
        List<Instant> recent = registrations.computeIfAbsent(address == null ? "" : address, key -> new ArrayList<>());
        synchronized (recent) {
            recent.removeIf(moment -> moment.isBefore(now.minus(Duration.ofHours(1))));
            if (recent.size() >= MAX_REGISTRATIONS_PER_HOUR) throw new OAuthException("invalid_client_metadata", "too many registrations, try again later");
            recent.add(now);
        }
        if (redirectUris == null || redirectUris.isEmpty() || redirectUris.size() > MAX_REDIRECT_URIS)
            throw new OAuthException("invalid_redirect_uri", "redirect_uris: 1 to " + MAX_REDIRECT_URIS + " addresses");
        for (String uri : redirectUris)
            if (!acceptableRedirect(uri)) throw new OAuthException("invalid_redirect_uri", "not allowed: " + uri);
        String clean = name == null || name.isBlank() ? "AI-assistent" : name.strip().replaceAll("\\p{Cntrl}", " ");
        AiClient client = clients.save(new AiClient("plg-" + randomText(18), clean.length() > MAX_NAME_LENGTH ? clean.substring(0, MAX_NAME_LENGTH) : clean, redirectUris));
        log.info("AI assistant \"{}\" registered ({})", client.getName(), client.getClientId());
        return client;
    }

    /** https anywhere, or http on the loopback address (a program on the computer of the user). No fragments, no other schemes. */
    static boolean acceptableRedirect(String uri) {
        if (uri == null || uri.length() > MAX_URI_LENGTH) return false;
        try {
            URI parsed = new URI(uri);
            if (parsed.getFragment() != null || parsed.getHost() == null || parsed.getUserInfo() != null) return false;
            String scheme = parsed.getScheme() == null ? "" : parsed.getScheme().toLowerCase(Locale.ROOT);
            return scheme.equals("https") || (scheme.equals("http") && isLoopback(parsed.getHost()));
        } catch (Exception invalid) {
            return false;
        }
    }

    private static boolean isLoopback(String host) {
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.equals("localhost") || lower.equals("127.0.0.1") || lower.equals("[::1]");
    }

    /**
     * Is {@code requested} one of the addresses of the assistant: the same address, or for a loopback address the same address on any port
     * (RFC 8252 section 7.3; Claude Code asks for a new port every time).
     */
    static boolean redirectMatches(List<String> registered, String requested) {
        if (requested == null) return false;
        if (registered.contains(requested)) return true;
        try {
            URI asked = new URI(requested);
            if (!"http".equalsIgnoreCase(asked.getScheme()) || asked.getHost() == null || !isLoopback(asked.getHost())) return false;
            for (String candidate : registered) {
                URI known = new URI(candidate);
                if ("http".equalsIgnoreCase(known.getScheme()) && known.getHost() != null && known.getHost().equalsIgnoreCase(asked.getHost())
                        && java.util.Objects.equals(known.getRawPath(), asked.getRawPath()) && java.util.Objects.equals(known.getRawQuery(), asked.getRawQuery()))
                    return true;
            }
        } catch (Exception invalid) {
            return false;
        }
        return false;
    }

    /** The assistant that asks to connect, when the address it wants to be sent back to is one of its own; else an OAuthException. */
    public AiClient checkRequest(String clientId, String redirectUri) {
        AiClient client = clients.findByClientId(clientId == null ? "" : clientId).orElseThrow(() -> new OAuthException("invalid_client", "unknown client_id"));
        if (!redirectMatches(client.getRedirectUris(), redirectUri)) throw new OAuthException("invalid_request", "redirect_uri is not registered for this client");
        return client;
    }

    // ---------------------------------------------------------------- authorization code

    /** The user agreed: the code for the assistant (S256 PKCE challenge required). */
    public String approve(long userId, String clientId, String redirectUri, String codeChallenge, String method) {
        checkRequest(clientId, redirectUri);
        if (codeChallenge == null || !codeChallenge.matches("[A-Za-z0-9_-]{43,128}") || !"S256".equals(method))
            throw new OAuthException("invalid_request", "PKCE with code_challenge_method S256 is required");
        Instant now = clock.instant();
        codes.values().removeIf(code -> code.expires().isBefore(now));
        String code = randomText(32);
        codes.put(code, new Code(userId, clientId, redirectUri, codeChallenge, now.plus(CODE_LIFETIME)));
        return code;
    }

    /** Code + verifier → keys. The code works once. */
    @Transactional
    public Tokens exchangeCode(String code, String verifier, String clientId, String redirectUri) {
        Code granted = code == null ? null : codes.remove(code);
        if (granted == null || granted.expires().isBefore(clock.instant())) throw new OAuthException("invalid_grant", "unknown or expired code");
        if (!granted.clientId().equals(clientId)) throw new OAuthException("invalid_grant", "the code is for another client");
        if (redirectUri != null && !granted.redirectUri().equals(redirectUri)) throw new OAuthException("invalid_grant", "redirect_uri differs");
        if (verifier == null || !granted.challenge().equals(s256(verifier))) throw new OAuthException("invalid_grant", "code_verifier does not match");
        AppUser user = activeUser(granted.userId()).orElseThrow(() -> new OAuthException("invalid_grant", "the account is no longer active"));
        AiClient client = clients.findByClientId(clientId).orElseThrow(() -> new OAuthException("invalid_client", "unknown client_id"));
        log.info("User {} connected the AI assistant \"{}\"", user.getId(), client.getName());
        return issue(user.getId(), randomText(16), client);
    }

    /** Refresh key → new keys; the old refresh key stops. A refresh key that was already used ends its whole connection. */
    @Transactional
    public Tokens refresh(String refreshToken, String clientId) {
        AiToken token = refreshToken == null ? null : tokens.findByHash(hash(refreshToken)).orElse(null);
        if (token == null) throw new OAuthException("invalid_grant", "unknown refresh token");
        if (token.getKind() != AiToken.Kind.REFRESH || (clientId != null && !clientId.equals(token.getClientId())))
            throw new OAuthException("invalid_grant", "not a refresh token of this client");
        if (token.expiredAt(clock.instant())) {
            tokens.deleteByGrant(token.getGrant());
            throw new OAuthException("invalid_grant", "refresh token expired");
        }
        if (activeUser(token.getUserId()).isEmpty()) throw new OAuthException("invalid_grant", "the account is no longer active");
        AiClient client = clients.findByClientId(token.getClientId()).orElseThrow(() -> new OAuthException("invalid_grant", "unknown client"));
        // the access keys of this connection end too: only the new ones count
        tokens.deleteByGrant(token.getGrant());
        return issue(token.getUserId(), token.getGrant(), client);
    }

    private Tokens issue(long userId, String grant, AiClient client) {
        Instant now = clock.instant();
        String access = "plga_" + randomText(32), refresh = "plgr_" + randomText(32);
        tokens.save(new AiToken(hash(access), AiToken.Kind.ACCESS, userId, grant, client.getClientId(), client.getName(), now.plus(ACCESS_LIFETIME)));
        tokens.save(new AiToken(hash(refresh), AiToken.Kind.REFRESH, userId, grant, client.getClientId(), client.getName(), now.plus(REFRESH_LIFETIME)));
        return new Tokens(access, refresh, ACCESS_LIFETIME.toSeconds());
    }

    // ---------------------------------------------------------------- personal keys and the list of the user

    /** A personal key for {@code days} days (one of {@link #PERSONAL_DAYS}); answers the key itself, shown to the user once. */
    @Transactional
    public String createPersonalKey(long userId, String name, int days) {
        if (!PERSONAL_DAYS.contains(days)) throw new IllegalArgumentException("days");
        String clean = name == null || name.isBlank() ? "AI-assistent" : name.strip().replaceAll("\\p{Cntrl}", " ");
        String key = "plg_" + randomText(32);
        tokens.save(new AiToken(hash(key), AiToken.Kind.PERSONAL, userId, randomText(16), null,
                clean.length() > MAX_NAME_LENGTH ? clean.substring(0, MAX_NAME_LENGTH) : clean, clock.instant().plus(Duration.ofDays(days))));
        log.info("User {} made a personal key for an AI assistant", userId);
        return key;
    }

    /** The connections (one per OAuth sign-in) and personal keys of the user, newest first. */
    @Transactional(readOnly = true)
    public List<Connection> connections(long userId) {
        Map<String, Connection> byGrant = new LinkedHashMap<>();
        Instant now = clock.instant();
        for (AiToken token : tokens.findByUserIdOrderByCreatedDesc(userId)) {
            if (token.getKind() == AiToken.Kind.ACCESS) continue;
            if (token.expiredAt(now)) continue;
            Connection earlier = byGrant.get(token.getGrant());
            byGrant.put(token.getGrant(), new Connection(token.getGrant(), token.getKind() == AiToken.Kind.PERSONAL ? "personal" : "oauth", token.getName(),
                    earlier != null ? earlier.created() : token.getCreated(), latest(earlier == null ? null : earlier.lastUsed(), lastUse(token)), token.getExpires()));
        }
        return List.copyOf(byGrant.values());
    }

    private String lastUse(AiToken token) {
        // the last use of a connection is that of its access keys: they are gone after a refresh, so keep it on the refresh key too
        return token.getLastUsed();
    }

    private static String latest(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) >= 0 ? a : b;
    }

    /** Ends a connection or personal key of the user; false when it is not his. */
    @Transactional
    public boolean end(long userId, String id) {
        boolean his = tokens.findByUserIdOrderByCreatedDesc(userId).stream().anyMatch(token -> token.getGrant().equals(id));
        if (his) {
            tokens.deleteByGrant(id);
            log.info("User {} ended a connection of an AI assistant", userId);
        }
        return his;
    }

    /** Signing out everywhere, a new password or a removed account: every key of the user stops. */
    @Transactional
    public void endAll(long userId) {
        tokens.deleteByUserId(userId);
    }

    // ---------------------------------------------------------------- using a key

    /** The user of an access or personal key, when it is valid; notes when it was last used. */
    @Transactional
    public Optional<AppUser> userOf(String key) {
        if (key == null || key.isBlank()) return Optional.empty();
        Optional<AiToken> found = tokens.findByHash(hash(key.trim()));
        if (found.isEmpty()) return Optional.empty();
        AiToken token = found.get();
        Instant now = clock.instant();
        if (token.getKind() == AiToken.Kind.REFRESH || token.expiredAt(now)) return Optional.empty();
        Optional<AppUser> user = activeUser(token.getUserId());
        if (user.isEmpty()) return Optional.empty();
        String minute = now.truncatedTo(java.time.temporal.ChronoUnit.MINUTES).toString();
        if (!minute.equals(token.getLastUsed())) {
            token.setLastUsed(minute);
            // the connection in the list shows it: the refresh key of the same connection carries it as well
            if (token.getKind() == AiToken.Kind.ACCESS)
                tokens.findByUserIdOrderByCreatedDesc(token.getUserId()).stream()
                        .filter(other -> other.getGrant().equals(token.getGrant()) && other.getKind() == AiToken.Kind.REFRESH)
                        .forEach(refresh -> refresh.setLastUsed(minute));
        }
        return user;
    }

    private Optional<AppUser> activeUser(long userId) {
        return users.findById(userId).filter(AppUser::isApproved);
    }

    /** Every night: expired keys go. */
    @Scheduled(cron = "0 17 3 * * *")
    @Transactional
    public void removeExpired() {
        int removed = tokens.deleteExpired(clock.instant().toString());
        if (removed > 0) log.info("{} expired key(s) of AI assistants removed", removed);
    }

    // ---------------------------------------------------------------- helpers

    static String s256(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String randomText(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
