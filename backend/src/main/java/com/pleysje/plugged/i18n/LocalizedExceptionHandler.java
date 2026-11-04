// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.i18n;

import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Answers a {@link LocalizedStatusException} with a problem detail (RFC 9457) whose {@code detail} is the message in the language of the
 * request, e.g. {@code {"status": 400, "detail": "Geef het symbool een naam", "messageKey": "symbol.nameRequired"}}.
 */
@RestControllerAdvice
public class LocalizedExceptionHandler {
    private final MessageSource messages;

    public LocalizedExceptionHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(LocalizedStatusException.class)
    public ResponseEntity<ProblemDetail> handle(LocalizedStatusException exception, Locale locale) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.getStatusCode(), messages.getMessage(exception, locale));
        problem.setProperty("messageKey", exception.getMessageKey());
        return ResponseEntity.status(exception.getStatusCode()).body(problem);
    }
}
