// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The AI link, from end to end against the real application: an assistant registers, the user agrees in the browser, the assistant draws
// a floor plan through MCP, and the user opens it with the offer to make the eendraadschema.
import {createHash} from 'node:crypto'
import {test, expect, t, REAL} from './fixtures.js'

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'e2e-verifier-of-the-assistant-long-enough-0123456789abcdef'
const challenge = createHash('sha256').update(VERIFIER).digest('base64url')

test.skip(!REAL, 'OAuth and MCP are the real application')

test('an assistant connects with the consent of the user and draws a plan he opens in Plugged', async ({page, app, backend, playwright, baseURL}) => {
    // the assistant itself: no cookies of the user
    const assistant = await playwright.request.newContext({baseURL})
    const client = await (await assistant.post('/oauth/register', {data: {client_name: 'Claude', redirect_uris: [CALLBACK]}})).json()
    expect(client.client_id).toMatch(/^plg-/)

    // the user, signed in, sees who asks and allows it; the browser goes back to the assistant with a code
    await app.open(backend)
    let code = null
    await page.route('https://claude.ai/**', (route) => {
        code = new URL(route.request().url()).searchParams.get('code')
        return route.fulfill({status: 200, contentType: 'text/html', body: '<p id="back-at-claude">ok</p>'})
    })
    const query = new URLSearchParams({response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, state: 'e2e', code_challenge: challenge,
        code_challenge_method: 'S256', resource: baseURL + '/mcp'})
    await page.goto('/oauth/authorize?' + query)
    await expect(page.locator('#ai-consent-text')).toContainText('Claude')
    await expect(page.locator('#ai-consent-host')).toContainText('claude.ai')
    await page.locator('#ai-consent-allow').click()
    await expect(page.locator('#back-at-claude')).toBeVisible()
    expect(code).toBeTruthy()

    const keys = await (await assistant.post('/oauth/token', {form: {grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: client.client_id, redirect_uri: CALLBACK}})).json()
    const mcp = async (method, params) =>
        (await assistant.post('/mcp', {headers: {Authorization: 'Bearer ' + keys.access_token, Accept: 'application/json, text/event-stream'}, data: {jsonrpc: '2.0', id: 1, method, params}})).json()
    expect((await mcp('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'e2e', version: '1'}})).result.serverInfo.name).toBe('plugged')
    const created = (await mcp('tools/call', {name: 'create_project', arguments: {name: 'Plan van de architect'}})).result.structuredContent
    const drawn = await mcp('tools/call', {
        name: 'draw_floor_plan',
        arguments: {
            project_id: created.id,
            floors: [{
                name: 'Gelijkvloers',
                rooms: [{name: 'Living', x: 0, y: 0, w: 6, h: 4}, {name: 'Keuken', x: 6, y: 0, w: 3, h: 4}],
                doors: [{x: 3, y: 4, rotation: 0, width: 0.9}],
                symbols: [
                    {type: 'stopcontact_pekid', x: 0.2, y: 2, mark: 'A1'},
                    {type: 'stopcontact_pekid', x: 8.8, y: 2, mark: 'A2'},
                    {type: 'lichtpunt', x: 3, y: 2, mark: 'B1'},
                    {type: 'schakelaar', x: 2.6, y: 3.9, mark: 'B1'},
                ],
            }],
        },
    })
    expect(drawn.result.isError).toBe(false)

    // the user follows the link of the assistant: the plan, and the offer to make the eendraadschema
    await page.goto(drawn.result.structuredContent.url.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.locator('#generate-dialog')).toBeVisible()
    await expect(page.locator('svg.sheet').first()).toContainText('Keuken')

    // Account › AI-assistent lists the connection; ending it stops the assistant
    await page.locator('#generate-close').click()
    await app.tab('account')
    await page.locator('#account-tab-ai').click()
    await expect(page.locator('#ai-url')).toHaveValue(baseURL + '/mcp')
    await expect(page.locator('#ai-connections')).toContainText('Claude')
    await page.locator('#ai-connections button').first().click()
    await expect(page.locator('#ai-status')).toHaveText(t('ai.ended', {name: 'Claude'}))
    expect((await assistant.post('/mcp', {headers: {Authorization: 'Bearer ' + keys.access_token}, data: {jsonrpc: '2.0', id: 2, method: 'ping'}})).status()).toBe(401)
    await assistant.dispose()
})
