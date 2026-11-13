// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Who has which project open right now, kept in memory (a restart forgets it, and the editors tell it again within seconds). Every editor
 * with a stored project open reports itself regularly (a heartbeat, see ProjectController); a report older than plugged.presence-timeout
 * (default 90 s: browsers slow the timers of a tab in the background down to about one a minute) counts as gone. One entry per browser window ({@code window}), so the same user in two windows is two entries.
 */
@Service
public class PresenceService {
    /** Somebody else in the project: {@code editing} = he has changes he did not save yet. */
    public record Viewer(long userId, String name, boolean editing, String since) {
    }

    private record Entry(long userId, String name, boolean editing, Instant since, Instant seen) {
    }

    private final Map<Long, Map<String, Entry>> byProject = new ConcurrentHashMap<>();
    private final Duration timeout;
    private final Clock clock;

    @Autowired
    public PresenceService(@Value("${plugged.presence-timeout:90s}") Duration timeout) {
        this(timeout, Clock.systemUTC());
    }

    PresenceService(Duration timeout, Clock clock) {
        this.timeout = timeout;
        this.clock = clock;
    }

    /** The window {@code window} of this user has the project open; answers the others in it (other windows of the same user included). */
    public List<Viewer> report(long projectId, String window, long userId, String name, boolean editing) {
        Instant now = clock.instant();
        Map<String, Entry> windows = byProject.computeIfAbsent(projectId, id -> new ConcurrentHashMap<>());
        windows.compute(window, (key, old) -> new Entry(userId, name, editing, old == null ? now : old.since(), now));
        return others(projectId, window);
    }

    /** The window closed the project (or the page). */
    public void leave(long projectId, String window) {
        Map<String, Entry> windows = byProject.get(projectId);
        if (windows == null) return;
        windows.remove(window);
        if (windows.isEmpty()) byProject.remove(projectId, windows);
    }

    /** Who else has the project open, the longest there first. */
    public List<Viewer> others(long projectId, String window) {
        Map<String, Entry> windows = byProject.get(projectId);
        if (windows == null) return List.of();
        Instant oldest = clock.instant().minus(timeout);
        windows.values().removeIf(entry -> entry.seen().isBefore(oldest));
        List<Viewer> others = new ArrayList<>();
        windows.entrySet().stream().filter(entry -> !entry.getKey().equals(window))
                .sorted(Comparator.comparing(entry -> entry.getValue().since()))
                .forEach(entry -> others.add(new Viewer(entry.getValue().userId(), entry.getValue().name(), entry.getValue().editing(), entry.getValue().since().toString())));
        return others;
    }

    /** Forgets everything (tests). */
    public void reset() {
        byProject.clear();
    }
}
