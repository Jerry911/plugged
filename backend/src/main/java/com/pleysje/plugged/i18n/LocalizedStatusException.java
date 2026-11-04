// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.i18n;

import java.util.Arrays;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * An error answer whose message is a key of the message files (i18n/messages*.properties) with its arguments: the message is written in the
 * language of the request (Accept-Language) by {@link LocalizedExceptionHandler}. An argument may itself be a {@link MessageSourceResolvable}
 * (e.g. the problem of a shape), which is translated too. The reason of the exception is the key, so the log stays the same in every language.
 */
public class LocalizedStatusException extends ResponseStatusException implements MessageSourceResolvable {
    private final String messageKey;
    private final transient Object[] arguments;

    public LocalizedStatusException(HttpStatus status, String messageKey, Object... arguments) {
        super(status, messageKey + (arguments.length == 0 ? "" : " " + Arrays.toString(arguments)));
        this.messageKey = messageKey;
        this.arguments = arguments;
    }

    public String getMessageKey() {
        return messageKey;
    }

    @Override
    public String[] getCodes() {
        return new String[] {messageKey};
    }

    @Override
    public Object[] getArguments() {
        return arguments.clone();
    }
}
