// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {getLanguage} from '../i18n/translate.js'

export const JSON_HEADERS = {'Content-Type': 'application/json'}

// The backend hands out its CSRF token in this cookie; every request that changes something sends it back in the header (Spring Security).
export const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The CSRF token of the cookie, or null when the backend has not handed one out (yet). */
export const csrfToken = () => {
    try {
        const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(CSRF_COOKIE + '='))
        return entry ? decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1)) : null
    } catch {
        return null // cookies not readable (sandboxed page): the backend refuses the change and says so
    }
}

const unauthorizedListeners = new Set()

/**
 * Calls `listener()` when an API call answers 401: the session has ended (expired, or the account was removed). Returns the function that
 * stops listening. The calls of /api/auth itself (a wrong password) do not count.
 */
export const onUnauthorized = (listener) => {
    unauthorizedListeners.add(listener)
    return () => unauthorizedListeners.delete(listener)
}

/**
 * fetch() with the active language as Accept-Language, so the backend answers (error messages) in the language of the user, and with the
 * CSRF token on requests that change something.
 */
export const apiFetch = (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase(),
        token = SAFE_METHODS.has(method) ? null : csrfToken()
    const response = fetch(url, {
        ...options,
        headers: {'Accept-Language': getLanguage(), ...(token ? {[CSRF_HEADER]: token} : {}), ...options.headers},
    })
    // watched on the side: the caller gets the promise of fetch() itself
    if (!String(url).startsWith('/api/auth/'))
        Promise.resolve(response).then(
            (answer) => answer?.status === 401 && unauthorizedListeners.forEach((listener) => listener()),
            () => {},
        )
    return response
}

/** The response when the request succeeded, null when it failed or the backend could not be reached. */
export const fetchOk = async (url, options) => {
    try {
        const response = await apiFetch(url, options)
        return response.ok ? response : null
    } catch {
        return null
    }
}
