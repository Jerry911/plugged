// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render} from '@testing-library/react'
import VerifyPanel from '../../../features/verify/VerifyPanel.jsx'
import {setLanguage, t} from '../../../i18n/translate.js'
import {byId, getById} from '../../utils.jsx'

const issues = [
    {id: '1', level: 'error', rule: 'earth', msg: 'Geen aarding'},
    {id: '2', level: 'warn', rule: 'x', msg: 'Let op', nodeId: 'n', pageName: 'Blad 2', page: 1},
    {id: '3', level: 'info', rule: 'spd', msg: 'Hint'},
]
test('lists issues with counts, navigates and closes', () => {
    const goTo = vi.fn(),
        close = vi.fn()
    render(<VerifyPanel issues={issues} onGoTo={goTo} onClose={close} />)
    expect(getById('verify-summary')).toHaveTextContent(t('verify.summary', {errors: 1, warnings: 1, notes: 1}))
    expect(getById('verify-issue-1').querySelector('small')).toHaveTextContent('— Blad 2')
    expect(byId('verify-ok')).toBeNull()
    fireEvent.click(getById('verify-issue-1'))
    expect(goTo).toHaveBeenCalledWith(issues[1])
    fireEvent.click(getById('verify-close'))
    expect(close).toHaveBeenCalled()
})
test('shows success state only for info/no issues', () => {
    render(<VerifyPanel issues={[issues[2]]} onGoTo={() => {}} onClose={() => {}} />)
    expect(getById('verify-ok')).toHaveTextContent(t('verify.noProblems'))
})

test('a click that ends a text selection does not jump to the element, so a message can be copied', () => {
    const goTo = vi.fn(),
        selection = vi.spyOn(window, 'getSelection').mockReturnValue({toString: () => 'Let op'})
    render(<VerifyPanel issues={issues} onGoTo={goTo} onClose={() => {}} />)
    fireEvent.click(getById('verify-issue-1'))
    expect(goTo).not.toHaveBeenCalled()
    selection.mockReturnValue({toString: () => ''})
    fireEvent.click(getById('verify-issue-1'))
    expect(goTo).toHaveBeenCalledTimes(1)
    selection.mockRestore()
})

test('shows the circuit and point of an issue in front of the message', () => {
    render(<VerifyPanel issues={[{id: '9', level: 'warn', rule: 'x', msg: 'Niet geplaatst', mark: 'F6'}, issues[0]]} onGoTo={() => {}} onClose={() => {}} />)
    // the error comes first (its group is the most serious), the warning of a rule outside the catalog after it
    const mark = getById('verify-issue-1').querySelector('b')
    expect(mark.textContent.trim()).toBe('F6')
    expect(getById('verify-issue-0').textContent).not.toMatch(/undefined/)
})

test('groups the issues as on the Controleregels page, the most serious group first and open, with how many of its checks are in order', () => {
    render(<VerifyPanel issues={issues} project={{footer: {}}} onGoTo={() => {}} onClose={() => {}} />)
    const groups = [...document.querySelectorAll('#verify-issues details')]
    expect(groups.map((group) => group.id).slice(0, 3)).toEqual(['verify-group-structure', 'verify-group-other', 'verify-group-special'])
    expect(groups[0].open).toBe(true)
    expect(groups[2].open).toBe(false)
    // groups without issues come last, folded and marked clean
    expect(getById('verify-group-sockets').className).toContain('clean')
    expect(getById('verify-group-sockets').open).toBe(false)
    // the earth rule fails: one check of its group is not in order
    const structure = getById('verify-group-structure').querySelector('.count').textContent.split('/').map(Number)
    expect(structure[1] - structure[0]).toBe(1)
    expect(getById('verify-checks')).toHaveTextContent(/\d+/)
})

test('lists what is still to be filled in before the inspection; a missing field opens Kaderinfo on it', () => {
    const onFooter = vi.fn()
    render(
        <VerifyPanel
            issues={[]}
            project={{footer: {straat: 'Kerkstraat 1', aardingsweerstand: '25'}}}
            onGoTo={() => {}}
            onClose={() => {}}
            onFooter={onFooter}
        />,
    )
    expect(getById('verify-todo-measurements').querySelector('.count')).toHaveTextContent('1/3')
    expect(byId('verify-fill-aardingsweerstand')).toBeNull()
    fireEvent.click(getById('verify-fill-isolatieweerstand'))
    expect(onFooter).toHaveBeenCalledWith('isolatieweerstand')
    expect(getById('verify-todo-footer').querySelector('.count')).toHaveTextContent('1/8')
})

test('the panel follows the language', () => {
    setLanguage('en')
    render(<VerifyPanel issues={issues} onGoTo={() => {}} onClose={() => {}} />)
    expect(getById('verify-summary')).toHaveTextContent('1 errors · 1 warnings · 1 notes')
    expect(getById('verify-close')).toHaveTextContent('Close')
})
