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
 * <p>
 * Every message of a window carries a number that only goes up ({@code seq}). A heartbeat that was still on its way when the window
 * left (closed the project or the page) arrives after the leave: it has a lower number than the leave and is ignored, or it would bring
 * the window back for the whole timeout. The number of a leave is kept as long as the timeout. A message without a number (an editor of
 * an older version) is not checked.
 */
@Service
public class PresenceService {
    /** Somebody else in the project: {@code editing} = he has changes he did not save yet. */
    public record Viewer(long userId, String name, boolean editing, String since) {
    }

    private record Entry(long userId, String name, boolean editing, Instant since, Instant seen) {
    }

    private record Left(long seq, Instant at) {
    }

    private final Map<Long, Map<String, Entry>> byProject = new ConcurrentHashMap<>();
    /** Per project, the windows that left it: the number of their leave, so a heartbeat sent before it is ignored. */
    private final Map<Long, Map<String, Left>> leftByProject = new ConcurrentHashMap<>();
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

    /** {@link #report(long, String, Long, long, String, boolean)} without a number. */
    public List<Viewer> report(long projectId, String window, long userId, String name, boolean editing) {
        return report(projectId, window, null, userId, name, editing);
    }

    /**
     * The window {@code window} of this user has the project open; answers the others in it (other windows of the same user included).
     * {@code seq}: the number of this heartbeat; one sent before the window left the project is ignored (null: not checked).
     */
    public List<Viewer> report(long projectId, String window, Long seq, long userId, String name, boolean editing) {
        Instant now = clock.instant();
        if (!sentBeforeLeaving(projectId, window, seq, now)) {
            Map<String, Entry> windows = byProject.computeIfAbsent(projectId, id -> new ConcurrentHashMap<>());
            windows.compute(window, (key, old) -> new Entry(userId, name, editing, old == null ? now : old.since(), now));
        }
        return others(projectId, window);
    }

    /** {@link #leave(long, String, Long)} without a number. */
    public void leave(long projectId, String window) {
        leave(projectId, window, null);
    }

    /** The window closed the project (or the page); {@code seq} the number of this message (null: unknown). */
    public void leave(long projectId, String window, Long seq) {
        if (seq != null)
            leftByProject.computeIfAbsent(projectId, id -> new ConcurrentHashMap<>())
                    .merge(window, new Left(seq, clock.instant()), (old, now) -> old.seq() >= now.seq() ? old : now);
        Map<String, Entry> windows = byProject.get(projectId);
        if (windows == null) return;
        windows.remove(window);
        if (windows.isEmpty()) byProject.remove(projectId, windows);
    }

    /** True when this heartbeat was sent before the window left the project (its leave has a higher number); forgets old leaves. */
    private boolean sentBeforeLeaving(long projectId, String window, Long seq, Instant now) {
        Map<String, Left> left = leftByProject.get(projectId);
        if (left == null) return false;
        Instant oldest = now.minus(timeout);
        left.values().removeIf(leave -> leave.at().isBefore(oldest));
        if (left.isEmpty()) leftByProject.remove(projectId, left);
        Left leave = left.get(window);
        return seq != null && leave != null && seq < leave.seq();
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
        leftByProject.clear();
    }
}
