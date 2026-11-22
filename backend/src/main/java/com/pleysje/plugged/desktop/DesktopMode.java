// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.desktop;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.UserService;
import java.awt.Desktop;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Plugged as a program on one computer (profile "desktop", started by {@link DesktopLauncher}): one local account and signing the browser
 * in without a password.
 * <ul>
 *   <li>The local account is the administrator, made at the first start with the name of the user of the computer and a random password
 *       nobody needs (plugged.admin.email of the desktop profile is a fixed address that is never written to).</li>
 *   <li>The browser is opened at /desktop/open?token=... : a token that works once and only for {@link #TOKEN_LIFETIME}, made by this
 *       process. Another program on the computer cannot guess it; a web page cannot read it.</li>
 *   <li>A second start of the program asks the running one to open the browser (POST /desktop/show with the secret of the instance file,
 *       which only the user of the computer can read).</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "plugged.desktop.enabled", havingValue = "true")
public class DesktopMode {
    private static final Logger log = LoggerFactory.getLogger(DesktopMode.class);
    public static final String INSTANCE_HEADER = "X-Plugged-Instance";
    static final Duration TOKEN_LIFETIME = Duration.ofMinutes(5);

    private final UserService userService;
    private final UserRepository users;
    private final ApplicationContext context;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Instant> tokens = new ConcurrentHashMap<>();
    private final String instanceSecret;

    public DesktopMode(UserService userService, UserRepository users, ApplicationContext context, Optional<Clock> clock,
                       @Value("${plugged.desktop.data-dir:}") String dataDirectory) {
        this.userService = userService;
        this.users = users;
        this.context = context;
        this.clock = clock.orElse(Clock.systemUTC());
        this.instanceSecret = randomText();
        if (!dataDirectory.isBlank()) log.info("Plugged runs as a program on this computer; its data is in {}", dataDirectory);
    }

    /** The first start: the local account. */
    @EventListener(ApplicationReadyEvent.class)
    public void createLocalAccount() {
        if (!userService.setupRequired()) return;
        String name = System.getProperty("user.name", "").trim();
        userService.setup(new AuthRequests.Setup(name.isEmpty() ? "Plugged" : name, "-", randomText(), null));
        log.info("Local account created");
    }

    /** The local account (the administrator). */
    public AppUser localAccount() {
        return users.findByEmail(userService.adminEmail()).orElseThrow();
    }

    /** A new one-time token to sign the browser in. */
    public String newToken() {
        Instant now = clock.instant();
        tokens.values().removeIf(expiry -> expiry.isBefore(now));
        String token = randomText();
        tokens.put(token, now.plus(TOKEN_LIFETIME));
        return token;
    }

    /** Is this a token made by {@link #newToken()} that was not used and has not expired; it cannot be used again. */
    public boolean useToken(String token) {
        if (token == null) return false;
        Instant expiry = tokens.remove(token);
        return expiry != null && !expiry.isBefore(clock.instant());
    }

    public boolean isInstanceSecret(String secret) {
        return secret != null && MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), instanceSecret.getBytes(StandardCharsets.UTF_8));
    }

    /** The address the browser opens: the sign-in link with a new token. */
    public URI openUri() {
        return URI.create("http://127.0.0.1:" + port() + "/desktop/open?token=" + newToken());
    }

    /** Opens Plugged in the browser of the computer, signed in. */
    public void openBrowser() {
        URI uri = openUri();
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(uri);
                return;
            }
        } catch (Exception | Error failed) {
            log.debug("The browser could not be opened by Java: {}", failed.getMessage());
        }
        String os = System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT);
        String[] command = os.contains("win") ? new String[] {"rundll32", "url.dll,FileProtocolHandler", uri.toString()}
                : os.contains("mac") ? new String[] {"open", uri.toString()} : new String[] {"xdg-open", uri.toString()};
        try {
            new ProcessBuilder(command).inheritIO().start();
        } catch (IOException failed) {
            // the link itself is not logged: it signs in
            log.warn("Open Plugged in a browser at http://127.0.0.1:{}/ (the browser could not be started: {})", port(), failed.getMessage());
        }
    }

    /** Writes the port and the secret of this instance, readable for the user of the computer only. */
    void writeInstanceFile(Path file, int port) throws IOException {
        String content = "port=" + port + "\nsecret=" + instanceSecret + "\n";
        Files.writeString(file, content, StandardCharsets.UTF_8);
        try {
            Files.setPosixFilePermissions(file, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException windows) {
            // Windows: the folder under %LOCALAPPDATA% is the user's own already
        }
        file.toFile().deleteOnExit();
    }

    int port() {
        return context instanceof WebServerApplicationContext web && web.getWebServer() != null ? web.getWebServer().getPort() : 0;
    }

    private String randomText() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
