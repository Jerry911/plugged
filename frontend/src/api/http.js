// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {getLanguage} from '../i18n/translate.js'

export const JSON_HEADERS = {'Content-Type': 'application/json'}

/** fetch() with the active language as Accept-Language, so the backend answers (error messages) in the language of the user. */
export const apiFetch = (url, options = {}) => fetch(url, {...options, headers: {'Accept-Language': getLanguage(), ...options.headers}})

/** The response when the request succeeded, null when it failed or the backend could not be reached. */
export const fetchOk = async (url, options) => {
    try {
        const response = await apiFetch(url, options)
        return response.ok ? response : null
    } catch {
        return null
    }
}
