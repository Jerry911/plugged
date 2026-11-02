// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.Collection;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

/**
 * Logging helper of the controllers. Every API call is logged the same way:
 * <ul>
 *   <li>DEBUG {@code --> GET /api/projects/{id} [id=3]}: the request, with its parameters</li>
 *   <li>DEBUG {@code <-- GET /api/projects/{id} ok in 4 ms: 200 OK}: the outcome (status, size of the answer) and the time it took</li>
 *   <li>WARN {@code !!! PUT /api/symbols/{k} failed in 1 ms: 400 BAD_REQUEST "..."}: a ResponseStatusException (no stack trace; the client made the mistake)</li>
 *   <li>ERROR the same with the stack trace for any other exception</li>
 * </ul>
 * Request bodies are never logged at DEBUG (a project can be large); use TRACE for the (truncated) body.
 */
final class ApiLog {
    private static final int TRACE_MAX = 2000;

    private ApiLog() {
        //Private constructor to avoid initialization
    }

    /** Runs an API call and logs request, outcome, duration and failure; the exception is rethrown unchanged. */
    static <T> T run(Logger log, String op, String args, Supplier<T> call) {
        log.debug("--> {} [{}]", op, args);
        long start = System.nanoTime();
        try {
            T result = call.get();
            log.debug("<-- {} ok in {} ms: {}", op, ms(start), describe(result));
            return result;
        } catch (ResponseStatusException e) {
            log.warn("!!! {} [{}] failed in {} ms: {} \"{}\"", op, args, ms(start), e.getStatusCode(), e.getReason());
            throw e;
        } catch (RuntimeException e) {
            log.error("!!! {} [{}] failed in {} ms", op, args, ms(start), e);
            throw e;
        }
    }

    /** Same for a call without a result. */
    static void runVoid(Logger log, String op, String args, Runnable call) {
        run(log, op, args, () -> {
            call.run();
            return null;
        });
    }

    /** TRACE: the (truncated) text of a request body. */
    static void body(Logger log, String op, String body) {
        if (log.isTraceEnabled()) log.trace("    {} body ({} chars): {}", op, body == null ? 0 : body.length(), truncate(body));
    }

    static String truncate(String s) {
        if (s == null) return "null";
        return s.length() <= TRACE_MAX ? s : s.substring(0, TRACE_MAX) + "... (+" + (s.length() - TRACE_MAX) + " chars)";
    }

    /** A short description of an answer: its status, its size or its key; never the full content. */
    static String describe(Object result) {
        if (result == null) return "no content";
        if (result instanceof ResponseEntity<?> r) return r.getStatusCode() + (r.getBody() == null ? "" : ", " + describe(r.getBody()));
        if (result instanceof Collection<?> c) return c.size() + " items";
        if (result instanceof CharSequence s) return s.length() + " chars";
        if (result instanceof SymbolDto d) return "symbol k=" + d.k() + ", name=\"" + d.name() + "\", " + (d.shapes() == null ? 0 : d.shapes().size()) + " shapes";
        return result.getClass().getSimpleName();
    }

    private static long ms(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }
}
