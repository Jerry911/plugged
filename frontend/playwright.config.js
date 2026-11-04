// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {existsSync} from 'node:fs'
import {defineConfig, devices} from '@playwright/test'
import {REAL} from './e2e/mode.js'

// Two ways to run the end-to-end tests (no test is skipped in either, except api.spec.js that only makes sense against the real application):
//  - default:                 the browser talks to the Vite dev server; the REST API (/api/projects, /api/symbols, /api/info) is an in-memory
//                             fake (e2e/fixtures.js), so no Java is needed and every test starts from a clean state.
//  - E2E_REAL_BACKEND=1       the browser talks to the real Spring Boot application, started from the packaged jar with the "test" profile
//    or `npm run e2e:all`:    (e2e/application-test.properties: in-memory H2 database, fixed donate link and contact address).
//                             This is what `mvn install` does (integration-test phase, after the backend and frontend tests). A backend
//                             that fails on purpose is simulated by answering those requests in the browser (see RealBackend in fixtures.js).
//                             Settings (all optional):
//                               E2E_JAR     the jar to start        (default ../backend/target/plugged-0.1.0.jar)
//                               E2E_JAVA    the java to start it with (default: java on the PATH)
//                               E2E_PORT    port of the application (default 18080, so a development instance on 8080 is left alone)
//                               E2E_REUSE_SERVER=1  use a server that already runs on that port instead of starting one. DANGEROUS:
//                                           these tests delete all projects and restore the symbol catalog of the server they talk to.
const CI = !!process.env.CI
const port = REAL ? Number(process.env.E2E_PORT || 18080) : 5173
const java = process.env.E2E_JAVA || 'java',
    jar = process.env.E2E_JAR || '../backend/target/plugged-0.1.0.jar'
if (REAL && !existsSync(jar) && process.env.E2E_REUSE_SERVER !== '1') throw new Error(`The application jar ${jar} does not exist: build it first (cd ../backend && mvn -DskipTests package) or set E2E_JAR.`)

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: {timeout: 7_000},
    fullyParallel: !REAL, // the real backend has one shared database
    workers: REAL ? 1 : undefined,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    reporter: [['list'], ['html', {open: 'never'}]],
    use: {
        baseURL: `http://localhost:${port}`,
        viewport: {width: 1500, height: 1000},
        // the application picks its language from the browser: the tests start in Dutch (i18n.spec.js switches the language itself)
        locale: 'nl-BE',
        acceptDownloads: true,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1500, height: 1000}, locale: 'nl-BE'}}],
    webServer: REAL
        ? {
              command: `"${java}" -jar "${jar}" --server.port=${port} --spring.profiles.active=test --spring.config.additional-location=optional:file:./e2e/`,
              url: `http://localhost:${port}/api/projects`,
              reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
              stdout: 'pipe',
              stderr: 'pipe',
              timeout: 120_000,
          }
        : {
              command: 'npm run dev -- --port 5173 --strictPort',
              url: 'http://localhost:5173',
              reuseExistingServer: !CI,
              timeout: 60_000,
          },
})
