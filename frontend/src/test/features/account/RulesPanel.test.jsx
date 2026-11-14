// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account → Controleregels: every user switches rules of Controleer off and on for himself; every change is saved at once.
import {fireEvent, render, waitFor} from '@testing-library/react'
import {useState} from 'react'
import RulesPanel from '../../../features/account/RulesPanel.jsx'
import {RULE_CATALOG, RULE_IDS} from '../../../model/rules.js'
import {t, setLanguage} from '../../../i18n/translate.js'
import {getById} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const puts = () => global.fetch.mock.calls.filter((call) => call[1]?.method === 'PUT').map((call) => JSON.parse(call[1].body).disabled)
let latest
const Host = ({initial = []}) => {
    const [disabled, setDisabled] = useState(initial)
    latest = disabled
    return <RulesPanel disabled={disabled} onChange={setDisabled} />
}

beforeEach(() => {
    global.fetch = vi.fn(async (url, options) => (url === '/api/account/rules' && options?.method === 'PUT' ? json({disabled: [...JSON.parse(options.body).disabled].sort()}) : json(null, 404)))
})

test('every rule of the catalog has a checkbox, grouped, with its level and AREI article', () => {
    render(<Host />)
    expect(getById('rules-count')).toHaveTextContent(t('ruleSettings.allActive', {total: RULE_IDS.length}))
    expect(getById('rules-all')).toBeDisabled()
    RULE_CATALOG.forEach(({group, rules}) => {
        expect(getById('rules-group-' + group)).toHaveTextContent(t('ruleSettings.groups.' + group))
        rules.forEach((rule) => expect(getById('rules-' + rule.id.replace(/[^A-Za-z0-9_-]/g, '_'))).toBeChecked())
    })
    const row = getById('rules-kring_sensitive').closest('label')
    expect(row).toHaveTextContent(t('ruleSettings.rules.kring.sensitive'))
    expect(row).toHaveTextContent('AREI 4.2.4.3 b')
    expect(row).toHaveTextContent(t('ruleSettings.levels.error'))
    expect(getById('rules-kring_light').closest('label')).toHaveTextContent(t('ruleSettings.notArei'))
})

test('switching a rule off saves it at once; switching it on again too', async () => {
    render(<Host />)
    fireEvent.click(getById('rules-spd'))
    expect(getById('rules-spd')).not.toBeChecked()
    await waitFor(() => expect(getById('rules-status')).toHaveTextContent(t('ruleSettings.saved')))
    expect(puts()).toEqual([['spd']])
    expect(getById('rules-count')).toHaveTextContent(t('ruleSettings.offCount', {count: 1, total: RULE_IDS.length}))
    fireEvent.click(getById('rules-spd'))
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(puts()[1]).toEqual([])
    expect(latest).toEqual([])
})

test('a whole group at once, and all on again', async () => {
    render(<Host initial={['docs.letter']} />)
    const docs = RULE_CATALOG.find((group) => group.group === 'documents').rules.map((rule) => rule.id)
    // half: indeterminate; a click switches the whole group on
    expect(getById('rules-group-toggle-documents').indeterminate).toBe(true)
    fireEvent.click(getById('rules-group-toggle-documents'))
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toEqual([])
    fireEvent.click(getById('rules-group-toggle-documents'))
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect([...puts()[1]].sort()).toEqual([...docs].sort())
    fireEvent.click(getById('rules-all'))
    await waitFor(() => expect(latest).toEqual([]))
})

test('when saving fails the checkbox goes back and the reason is shown', async () => {
    global.fetch = vi.fn(async () => json({messageKey: 'account.invalidRules', message: 'Onbekende regel'}, 400))
    render(<Host />)
    fireEvent.click(getById('rules-spd'))
    await waitFor(() => expect(getById('rules-status')).toHaveClass('error'))
    expect(getById('rules-spd')).toBeChecked()
    expect(latest).toEqual([])
})

test('every rule and group has a name in every language', () => {
    for (const language of ['nl', 'fr', 'en']) {
        setLanguage(language)
        RULE_CATALOG.forEach(({group, rules}) => {
            expect(t('ruleSettings.groups.' + group)).not.toBe('ruleSettings.groups.' + group)
            rules.forEach((rule) => expect(t('ruleSettings.rules.' + rule.id)).not.toBe('ruleSettings.rules.' + rule.id))
        })
    }
    setLanguage('nl')
})

test('a rule with a date says from when it applies', () => {
    render(<Host />)
    expect(getById('rules-diff_circuits').closest('label')).toHaveTextContent(t('ruleSettings.since', {date: '01/06/2023'}))
    expect(getById('rules-kring_sensitive').closest('label')).toHaveTextContent(t('ruleSettings.sincePartial', {date: '01/06/2023'}))
    expect(getById('rules-socket_childSafe').closest('label')).toHaveTextContent('01/03/2025')
    expect(getById('rules-earth').closest('label')).not.toHaveTextContent(/\d\d\/\d\d\/\d{4}/)
})
