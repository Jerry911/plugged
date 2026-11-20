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

    /** A new password of the signed-in user; {@code currentPassword} proves it is him (also after a temporary one of an administrator). */
    public record ChangePassword(
            String currentPassword,
            @NotNull(message = "auth.passwordTooShort") @Size(min = MIN_PASSWORD_LENGTH, message = "auth.passwordTooShort")
            @MaxUtf8Bytes(value = MAX_PASSWORD_BYTES, message = "auth.passwordTooLong") String newPassword) {
    }

    /** Removing the own account: the password confirms it. */
    /** The largest number of rules one request may switch off (there are about 50). */
    public static final int MAX_DISABLED_RULES = 200;
    /** A rule id: a word, or two joined by a dot ('earth', 'kring.light', 'docs.cableType'). */
    public static final String RULE_PATTERN = "[a-z][A-Za-z]{0,24}(\\.[a-z][A-Za-z]{0,24})?";

    /** PUT /api/account/rules: the rules of Controleer the user switches off (all others are on). */
    public record RuleSettings(
            @NotNull(message = "account.invalidRules") @Size(max = MAX_DISABLED_RULES, message = "account.invalidRules")
            java.util.List<@NotNull(message = "account.invalidRules") @Pattern(regexp = RULE_PATTERN, message = "account.invalidRules") String> disabled) {
    }

    /** The colour themes of the interface (Account → Mijn account); null on an account = the first, marine. */
    public static final String THEME_PATTERN = "marine|werkbank|helder";

    /** PUT /api/account/theme: the colours the user sees the interface in. */
    public record ThemeSetting(
            @NotNull(message = "account.invalidTheme") @Pattern(regexp = THEME_PATTERN, message = "account.invalidTheme") String theme) {
    }

    public record DeleteAccount(String password) {
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
