// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.config;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

/**
 * The language of an answer: the frontend sends the language the user chose as Accept-Language. Plugged speaks Dutch, French and English;
 * any other language (or none) gets English. The messages are in i18n/messages.properties (Dutch), messages_fr.properties and messages_en.properties.
 */
@Configuration
public class LocaleConfig {
    public static final Locale DUTCH = Locale.forLanguageTag("nl");
    public static final List<Locale> SUPPORTED = List.of(DUTCH, Locale.FRENCH, Locale.ENGLISH);

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setSupportedLocales(SUPPORTED);
        resolver.setDefaultLocale(Locale.ENGLISH);
        return resolver;
    }

    @Bean
    public MessageSource messageSource() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding(StandardCharsets.UTF_8.name());
        // never the language of the server (the resolver above only lets nl, fr and en through)
        messages.setFallbackToSystemLocale(false);
        // ' is written as '' in every message, also in the ones without arguments
        messages.setAlwaysUseMessageFormat(true);
        return messages;
    }
}
