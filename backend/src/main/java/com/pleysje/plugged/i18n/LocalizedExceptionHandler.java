// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.i18n;

import jakarta.validation.ConstraintViolation;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Answers a {@link LocalizedStatusException} with a problem detail (RFC 9457) whose {@code detail} is the message in the language of the
 * request, e.g. {@code {"status": 400, "detail": "Geef het symbool een naam", "messageKey": "symbol.nameRequired"}}. A request body that
 * fails its Bean Validation constraints ({@code @Valid}) is answered the same way, see {@link Violations}.
 */
@RestControllerAdvice
public class LocalizedExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(LocalizedExceptionHandler.class);
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

    /** Two saves of one project at the same moment: the one that comes second is refused like any save of an older version. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ProblemDetail> handle(ObjectOptimisticLockingFailureException exception, Locale locale) {
        return handle(new LocalizedStatusException(HttpStatus.CONFLICT, "project.changedElsewhere", String.valueOf(exception.getIdentifier())), locale);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handle(MethodArgumentNotValidException exception, Locale locale) {
        List<ConstraintViolation<?>> violations = new ArrayList<>();
        for (ObjectError error : exception.getBindingResult().getAllErrors())
            if (error.contains(ConstraintViolation.class)) violations.add(error.unwrap(ConstraintViolation.class));
        if (violations.isEmpty()) {
            ProblemDetail problem = exception.getBody();
            return ResponseEntity.status(exception.getStatusCode()).body(problem);
        }
        LocalizedStatusException localized = Violations.toException(violations);
        log.warn("!!! invalid request body: {}", localized.getReason());
        return handle(localized, locale);
    }
}
