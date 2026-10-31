// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Which backend the end-to-end tests talk to, and the settings of the test profile of the application (e2e/application-test.properties).
import {readFileSync} from 'node:fs'

/**
 * true: the real Spring Boot application, started from the jar with the "test" profile (what `mvn install` and `npm run e2e:all` do);
 * false: the in-memory fake of e2e/fixtures.js and the Vite dev server (`npm run e2e`).
 * `npm run e2e:all` is recognised by its name, so it also works in a shell that cannot set environment variables in front of a command.
 */
export const REAL = !!process.env.E2E_REAL_BACKEND || process.env.npm_lifecycle_event === 'e2e:all'

/** the plugged.* (and other) settings of e2e/application-test.properties */
export const testProperties = Object.fromEntries(
    readFileSync(new URL('./application-test.properties', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
/** what GET /api/info tells with the test profile */
export const testInfo = {donateUrl: testProperties['plugged.donate.paypal-url'], contactEmail: testProperties['plugged.contact.email']}
