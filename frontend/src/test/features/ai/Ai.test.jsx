// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The AI link in the editor: the page where an assistant asks to connect, and Account › AI-assistent.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import {unzipSync, strFromU8} from 'fflate'
import ConsentPage, {consentRequest} from '../../../features/ai/ConsentPage.jsx'
import AiPanel, {skillZip} from '../../../features/ai/AiPanel.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, getById} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const USER = {id: 2, name: 'Testa', surname: 'Voorbeeldenaar'}
const SEARCH = '?response_type=code&client_id=plg-1&redirect_uri=' + encodeURIComponent('https://claude.ai/api/mcp/auth_callback') + '&state=s1&code_challenge=abc&code_challenge_method=S256'

test('the request of the assistant is read from the address', () => {
    expect(consentRequest(SEARCH)).toMatchObject({client_id: 'plg-1', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', state: 's1', code_challenge_method: 'S256'})
})

test('the user sees who asks and where he goes back to; allowing sends the answer and follows it', async () => {
    const sent = []
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url.startsWith('/api/ai/authorize?')) return json({client: 'Claude', redirectHost: 'claude.ai'})
        sent.push(JSON.parse(options.body))
        return json({redirect: 'https://claude.ai/api/mcp/auth_callback?code=c1&state=s1'})
    })
    const go = vi.fn()
    render(<ConsentPage user={USER} search={SEARCH} go={go} />)
    await waitFor(() => expect(getById('ai-consent-text')).toHaveTextContent('Claude'))
    expect(getById('ai-consent-text')).toHaveTextContent('Testa Voorbeeldenaar')
    expect(getById('ai-consent-host')).toHaveTextContent('claude.ai')
    fireEvent.click(getById('ai-consent-allow'))
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=c1&state=s1'))
    expect(sent[0]).toMatchObject({client_id: 'plg-1', approve: 'true', code_challenge: 'abc', state: 's1'})
})

test('an invalid request sends nobody anywhere; a program on this computer gets a warning', async () => {
    global.fetch = vi.fn(async () => json({error: 'invalid_request', error_description: 'redirect_uri is not registered'}, 400))
    const go = vi.fn()
    const {unmount} = render(<ConsentPage user={USER} search={SEARCH} go={go} />)
    await waitFor(() => expect(getById('ai-consent-invalid')).toHaveTextContent('redirect_uri is not registered'))
    expect(byId('ai-consent-allow')).toBeNull()
    unmount()
    render(<ConsentPage user={USER} search="?client_id=x" go={go} />)
    await waitFor(() => getById('ai-consent-invalid'))
    global.fetch = vi.fn(async () => json({client: 'Claude Code', redirectHost: 'localhost'}))
    render(<ConsentPage user={USER} search={SEARCH} go={go} />)
    await waitFor(() => expect(document.body.textContent).toContain(t('ai.consent.loopback')))
    expect(go).not.toHaveBeenCalled()
})

test('Account › AI-assistent: the address, the connections to end and a personal key shown once', async () => {
    let connections = [{id: 'g1', kind: 'oauth', name: 'Claude', created: '2026-11-20T10:00:00Z', lastUsed: '2026-11-21T10:00:00Z', expires: null}]
    const calls = []
    global.fetch = vi.fn(async (url, options = {}) => {
        calls.push([options.method || 'GET', url])
        if (url === '/api/ai') return json({url: 'https://plugged.example.be/mcp', connections, keyDays: [30, 90, 365]})
        if (url === '/api/ai/keys') return json({key: 'plg_secret'}, 201)
        connections = []
        return {ok: true, status: 204}
    })
    window.confirm = vi.fn(() => true)
    render(<AiPanel />)
    await waitFor(() => expect(getById('ai-url').value).toBe('https://plugged.example.be/mcp'))
    expect(getById('ai-claude-code')).toHaveTextContent('claude mcp add --transport http plugged https://plugged.example.be/mcp')
    expect(byId('ai-local-only')).toBeNull()
    expect(getById('ai-connection-g1')).toHaveTextContent('Claude')
    fireEvent.click(getById('ai-connection-g1').querySelector('button'))
    await waitFor(() => expect(getById('ai-none')).toBeTruthy())
    expect(calls).toContainEqual(['DELETE', '/api/ai/connections/g1'])
    fireEvent.change(getById('ai-key-name'), {target: {value: 'Laptop'}})
    fireEvent.change(getById('ai-key-days'), {target: {value: '30'}})
    await act(async () => fireEvent.submit(getById('ai-key-form')))
    await waitFor(() => expect(getById('ai-new-key').querySelector('input').value).toBe('plg_secret'))
    expect(JSON.parse(global.fetch.mock.calls.find((call) => call[0] === '/api/ai/keys')[1].body)).toEqual({name: 'Laptop', days: 30})
})

test('on this computer only: the panel says the hosted assistants cannot reach it; the skill carries the address', async () => {
    global.fetch = vi.fn(async () => json({url: 'http://127.0.0.1:47800/mcp', connections: [], keyDays: [30]}))
    render(<AiPanel desktop />)
    await waitFor(() => getById('ai-local-only'))
    const files = unzipSync(skillZip('https://plugged.example.be/mcp'))
    const text = strFromU8(files['plugged-drawings/SKILL.md'])
    expect(text).toMatch(/^---\nname: plugged-drawings\n/)
    expect(text).toContain('Plugged (https://plugged.example.be)')
    // claude.ai refuses a skill whose description is longer than 200 characters
    expect(text.match(/^description: (.*)$/m)[1].length).toBeLessThanOrEqual(200)
})
