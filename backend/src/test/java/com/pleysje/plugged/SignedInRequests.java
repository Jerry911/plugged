// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

/**
 * The requests of {@link MockMvcRequestBuilders}, made by a signed-in user with a valid CSRF token: the tests of the API itself (projects,
 * symbols, ...) do not have to sign in first. The tests of signing in itself are in AuthControllerTest.
 */
public final class SignedInRequests {
    private SignedInRequests() {
    }

    private static MockHttpServletRequestBuilder signedIn(MockHttpServletRequestBuilder request) {
        return request.with(user("tester").roles("USER")).with(csrf());
    }

    public static MockHttpServletRequestBuilder get(String url, Object... variables) {
        return signedIn(MockMvcRequestBuilders.get(url, variables));
    }

    public static MockHttpServletRequestBuilder put(String url, Object... variables) {
        return signedIn(MockMvcRequestBuilders.put(url, variables));
    }

    public static MockHttpServletRequestBuilder post(String url, Object... variables) {
        return signedIn(MockMvcRequestBuilders.post(url, variables));
    }

    public static MockHttpServletRequestBuilder delete(String url, Object... variables) {
        return signedIn(MockMvcRequestBuilders.delete(url, variables));
    }
}
