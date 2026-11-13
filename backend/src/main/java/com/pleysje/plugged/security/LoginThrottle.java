// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import com.pleysje.plugged.i18n.LocalizedStatusException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Brakes on guessing passwords and on mass registration, kept in memory (a restart forgets them; the lockout of an existing account is
 * stored with the account, see UserService):
 * <ul>
 *   <li><b>per network address</b>: at most plugged.auth.ip-max-attempts sign-in attempts that failed, first starts and registrations per
 *       plugged.auth.ip-window; more answer 429 until the window has passed;</li>
 *   <li><b>per unknown email address</b>: the same lockout as for an account (plugged.auth.max-failed-logins wrong attempts lock it for
 *       plugged.auth.lockout), so the answers do not tell which addresses have an account.</li>
 * </ul>
 */
@Component
public class LoginThrottle {
    private static final Logger log = LoggerFactory.getLogger(LoginThrottle.class);
    /** a bound on the memory the attempts can take; past it the expired entries are removed */
    private static final int MAX_TRACKED = 10_000;

    private final int ipMaxAttempts;
    private final Duration ipWindow;
    private final int maxFailedLogins;
    private final Duration lockout;
    private final Clock clock;
    private final Map<String, Deque<Instant>> attemptsByAddress = new ConcurrentHashMap<>();
    private final Map<String, Lock> unknownEmails = new ConcurrentHashMap<>();

    /** Wrong attempts of an unknown address and, once there were too many, until when it is locked. */
    private static final class Lock {
        int failures;
        Instant lockedUntil;
    }

    @Autowired
    public LoginThrottle(@Value("${plugged.auth.ip-max-attempts:30}") int ipMaxAttempts,
                         @Value("${plugged.auth.ip-window:15m}") Duration ipWindow,
                         @Value("${plugged.auth.max-failed-logins:5}") int maxFailedLogins,
                         @Value("${plugged.auth.lockout:15m}") Duration lockout) {
        this(ipMaxAttempts, ipWindow, maxFailedLogins, lockout, Clock.systemUTC());
    }

    LoginThrottle(int ipMaxAttempts, Duration ipWindow, int maxFailedLogins, Duration lockout, Clock clock) {
        this.ipMaxAttempts = ipMaxAttempts;
        this.ipWindow = ipWindow;
        this.maxFailedLogins = maxFailedLogins;
        this.lockout = lockout;
        this.clock = clock;
    }

    public int maxFailedLogins() {
        return maxFailedLogins;
    }

    public Duration lockout() {
        return lockout;
    }

    public Instant now() {
        return clock.instant();
    }

    /** @throws LocalizedStatusException 429 when this address made too many attempts within the window */
    public void checkAddress(String address) {
        Deque<Instant> attempts = attemptsByAddress.get(address);
        if (attempts == null) return;
        synchronized (attempts) {
            dropExpired(attempts);
            if (attempts.size() >= ipMaxAttempts) {
                log.info("Too many sign-in attempts from {}", UserService.forLog(address));
                throw new LocalizedStatusException(HttpStatus.TOO_MANY_REQUESTS, "auth.tooManyAttempts", minutesLeft(attempts.peekFirst().plus(ipWindow)));
            }
        }
    }

    /** One more attempt of this address (a failed sign-in, a first start, a registration). */
    public void recordAddress(String address) {
        if (attemptsByAddress.size() > MAX_TRACKED) cleanUp();
        Deque<Instant> attempts = attemptsByAddress.computeIfAbsent(address, key -> new ArrayDeque<>());
        synchronized (attempts) {
            dropExpired(attempts);
            attempts.addLast(now());
        }
    }

    /** @throws LocalizedStatusException 423 while this unknown address is locked (as an account would be) */
    public void checkUnknownEmail(String email) {
        Lock lock = unknownEmails.get(email);
        if (lock == null) return;
        synchronized (lock) {
            if (lock.lockedUntil != null && lock.lockedUntil.isAfter(now())) throw locked(lock.lockedUntil);
        }
    }

    /** A wrong attempt for an address without an account; answers the end of the lockout when this attempt locked it, else null. */
    public Instant recordUnknownEmail(String email) {
        if (unknownEmails.size() > MAX_TRACKED) cleanUp();
        Lock lock = unknownEmails.computeIfAbsent(email, key -> new Lock());
        synchronized (lock) {
            if (lock.lockedUntil != null && !lock.lockedUntil.isAfter(now())) {
                lock.lockedUntil = null;
                lock.failures = 0;
            }
            if (++lock.failures >= maxFailedLogins) {
                lock.lockedUntil = now().plus(lockout);
                lock.failures = 0;
                return lock.lockedUntil;
            }
            return null;
        }
    }

    /** The answer for a locked account (or unknown address): 423 with the minutes until it opens again. */
    public LocalizedStatusException locked(Instant until) {
        return new LocalizedStatusException(HttpStatus.LOCKED, "auth.accountLocked", minutesLeft(until));
    }

    private long minutesLeft(Instant until) {
        long seconds = Math.max(0, Duration.between(now(), until).getSeconds());
        return Math.max(1, (seconds + 59) / 60);
    }

    private void dropExpired(Deque<Instant> attempts) {
        Instant oldest = now().minus(ipWindow);
        while (!attempts.isEmpty() && !attempts.peekFirst().isAfter(oldest)) attempts.removeFirst();
    }

    private void cleanUp() {
        attemptsByAddress.entrySet().removeIf(entry -> {
            synchronized (entry.getValue()) {
                dropExpired(entry.getValue());
                return entry.getValue().isEmpty();
            }
        });
        Instant now = now();
        unknownEmails.entrySet().removeIf(entry -> entry.getValue().lockedUntil == null || !entry.getValue().lockedUntil.isAfter(now));
    }

    /** Forgets all attempts (tests). */
    public void reset() {
        attemptsByAddress.clear();
        unknownEmails.clear();
    }
}
