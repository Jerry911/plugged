// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.logging;

import com.pleysje.plugged.dto.SymbolDto;
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
 *   <li>WARN {@code !!! PUT /api/symbols/{key} failed in 1 ms: 400 BAD_REQUEST "..."}: a ResponseStatusException (no stack trace; the client made the mistake)</li>
 *   <li>ERROR the same with the stack trace for any other exception</li>
 * </ul>
 * Request bodies are never logged at DEBUG (a project can be large); use TRACE for the (truncated) body.
 */
public final class ApiLog {
    private static final int TRACE_MAX_LENGTH = 2000;

    private ApiLog() {
    }

    /** Runs an API call and logs request, outcome, duration and failure; the exception is rethrown unchanged. */
    public static <T> T run(Logger log, String operation, String arguments, Supplier<T> call) {
        log.debug("--> {} [{}]", operation, arguments);
        long start = System.nanoTime();
        try {
            T result = call.get();
            log.debug("<-- {} ok in {} ms: {}", operation, millisecondsSince(start), describe(result));
            return result;
        } catch (ResponseStatusException exception) {
            log.warn("!!! {} [{}] failed in {} ms: {} \"{}\"", operation, arguments, millisecondsSince(start), exception.getStatusCode(), exception.getReason());
            throw exception;
        } catch (RuntimeException exception) {
            log.error("!!! {} [{}] failed in {} ms", operation, arguments, millisecondsSince(start), exception);
            throw exception;
        }
    }

    /** Same for a call without a result. */
    public static void runVoid(Logger log, String operation, String arguments, Runnable call) {
        run(log, operation, arguments, () -> {
            call.run();
            return null;
        });
    }

    /** TRACE: the (truncated) text of a request body. */
    public static void body(Logger log, String operation, String body) {
        if (log.isTraceEnabled()) log.trace("    {} body ({} chars): {}", operation, body == null ? 0 : body.length(), truncate(body));
    }

    public static String truncate(String text) {
        if (text == null) return "null";
        return text.length() <= TRACE_MAX_LENGTH ? text : text.substring(0, TRACE_MAX_LENGTH) + "... (+" + (text.length() - TRACE_MAX_LENGTH) + " chars)";
    }

    /** A short description of an answer: its status, its size or its key; never the full content. */
    public static String describe(Object result) {
        if (result == null) return "no content";
        if (result instanceof ResponseEntity<?> response) return response.getStatusCode() + (response.getBody() == null ? "" : ", " + describe(response.getBody()));
        if (result instanceof Collection<?> collection) return collection.size() + " items";
        if (result instanceof CharSequence text) return text.length() + " chars";
        if (result instanceof SymbolDto symbol) {
            return "symbol k=" + symbol.key() + ", name=\"" + symbol.name() + "\", " + (symbol.shapes() == null ? 0 : symbol.shapes().size()) + " shapes";
        }
        return result.getClass().getSimpleName();
    }

    private static long millisecondsSince(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }
}
