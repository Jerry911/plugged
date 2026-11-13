// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.i18n;

import com.pleysje.plugged.validation.MaxUtf8Bytes;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Path;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.lang.annotation.Annotation;
import java.lang.reflect.RecordComponent;
import java.util.Collection;
import java.util.Comparator;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

/**
 * Bean Validation in the language of the request. The constraints on the request records carry a key of the message files as their message
 * (e.g. {@code @Size(max = 100, message = "auth.nameTooLong")}); a violation becomes a {@link LocalizedStatusException} (400) with that key
 * and the argument the message needs:
 * <ul>
 *   <li>{@code @Size}, {@code @Max}: the maximum ({@code {0}}); a key ending in "TooShort" and {@code @Min}: the minimum;</li>
 *   <li>{@link MaxUtf8Bytes}: the number of bytes;</li>
 *   <li>{@code @Pattern}: the value that was refused;</li>
 *   <li>anything else: no arguments.</li>
 * </ul>
 * When several values are wrong, the first field of the record is reported (so the message does not change from one request to the next).
 */
public final class Violations {
    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = FACTORY.getValidator();

    private Violations() {
    }

    /** @throws LocalizedStatusException 400 for the first violated constraint of {@code bean} */
    public static void check(Object bean) {
        if (bean == null) return;
        Set<ConstraintViolation<Object>> violations = VALIDATOR.validate(bean);
        if (!violations.isEmpty()) throw toException(violations);
    }

    /** The first violation (in the order of the fields of the record) as a localized 400. */
    public static LocalizedStatusException toException(Collection<? extends ConstraintViolation<?>> violations) {
        ConstraintViolation<?> first = violations.stream().min(Comparator.comparingInt(Violations::rank)).orElseThrow();
        return toException(first);
    }

    public static LocalizedStatusException toException(ConstraintViolation<?> violation) {
        String key = violation.getMessageTemplate();
        Annotation constraint = violation.getConstraintDescriptor().getAnnotation();
        Map<String, Object> attributes = violation.getConstraintDescriptor().getAttributes();
        Object[] arguments;
        if (constraint instanceof Size) arguments = new Object[] {attributes.get(key.endsWith("TooShort") ? "min" : "max")};
        else if (constraint instanceof Min || constraint instanceof Max || constraint instanceof MaxUtf8Bytes) arguments = new Object[] {attributes.get("value")};
        else if (constraint instanceof Pattern) arguments = new Object[] {String.valueOf(violation.getInvalidValue())};
        else arguments = new Object[0];
        return new LocalizedStatusException(HttpStatus.BAD_REQUEST, key, arguments);
    }

    /** Position of the field of the violation in its record (first field first); "required" constraints before the others on one field. */
    private static int rank(ConstraintViolation<?> violation) {
        String field = firstNode(violation.getPropertyPath());
        int position = 999;
        Class<?> type = violation.getRootBeanClass();
        if (type.isRecord()) {
            RecordComponent[] components = type.getRecordComponents();
            for (int index = 0; index < components.length; index++) if (components[index].getName().equals(field)) position = index;
        }
        String constraint = violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName();
        boolean required = constraint.startsWith("Not");
        return position * 2 + (required ? 0 : 1);
    }

    private static String firstNode(Path path) {
        Iterator<Path.Node> nodes = path.iterator();
        return nodes.hasNext() ? nodes.next().getName() : "";
    }
}
