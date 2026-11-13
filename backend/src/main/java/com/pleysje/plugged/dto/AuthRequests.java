// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.pleysje.plugged.validation.MaxUtf8Bytes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * The bodies of the requests of /api/auth, checked with Bean Validation ({@code @Valid} in AuthController). The messages are keys of the
 * message files (see {@link com.pleysje.plugged.i18n.Violations}). Names are trimmed and email addresses trimmed and put in lower case
 * before they are checked.
 */
public final class AuthRequests {
    public static final int MAX_NAME_LENGTH = 100;
    public static final int MAX_EMAIL_LENGTH = 254;
    public static final int MIN_PASSWORD_LENGTH = 8;
    /** bcrypt only looks at the first 72 bytes of a password: a longer one is refused instead of being cut silently. */
    public static final int MAX_PASSWORD_BYTES = 72;
    /** something@something.something, without spaces */
    public static final String EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";

    private AuthRequests() {
    }

    /**
     * First start: the details of the administrator. The email address is not part of it: it is plugged.admin.email. {@code setupKey} is
     * the secret key the application printed in its log at start-up (see SetupKey).
     */
    public record Setup(
            @NotBlank(message = "auth.nameRequired") @Size(max = MAX_NAME_LENGTH, message = "auth.nameTooLong") String name,
            @NotBlank(message = "auth.surnameRequired") @Size(max = MAX_NAME_LENGTH, message = "auth.nameTooLong") String surname,
            @NotNull(message = "auth.passwordTooShort") @Size(min = MIN_PASSWORD_LENGTH, message = "auth.passwordTooShort")
            @MaxUtf8Bytes(value = MAX_PASSWORD_BYTES, message = "auth.passwordTooLong") String password,
            String setupKey) {
        public Setup {
            name = trim(name);
            surname = trim(surname);
        }
    }

    public record Register(
            @NotBlank(message = "auth.nameRequired") @Size(max = MAX_NAME_LENGTH, message = "auth.nameTooLong") String name,
            @NotBlank(message = "auth.surnameRequired") @Size(max = MAX_NAME_LENGTH, message = "auth.nameTooLong") String surname,
            @NotBlank(message = "auth.invalidEmail") @Size(max = MAX_EMAIL_LENGTH, message = "auth.invalidEmail")
            @Pattern(regexp = EMAIL_PATTERN, message = "auth.invalidEmail") String email,
            @NotNull(message = "auth.passwordTooShort") @Size(min = MIN_PASSWORD_LENGTH, message = "auth.passwordTooShort")
            @MaxUtf8Bytes(value = MAX_PASSWORD_BYTES, message = "auth.passwordTooLong") String password) {
        public Register {
            name = trim(name);
            surname = trim(surname);
            email = normalizeEmail(email);
        }
    }

    /** Not validated: whatever is typed, a wrong address or password answers "wrong email address or password". */
    public record Login(String email, String password) {
        public Login {
            email = normalizeEmail(email);
            password = password == null ? "" : password;
        }
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    /** Trimmed and in lower case ("" for null), as the addresses are stored. */
    public static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
