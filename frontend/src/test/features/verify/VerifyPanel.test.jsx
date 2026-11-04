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
    const mark = getById('verify-issue-0').querySelector('b')
    expect(mark.textContent.trim()).toBe('F6')
    expect(getById('verify-issue-1').textContent).not.toMatch(/undefined/)
})

test('the panel follows the language', () => {
    setLanguage('en')
    render(<VerifyPanel issues={issues} onGoTo={() => {}} onClose={() => {}} />)
    expect(getById('verify-summary')).toHaveTextContent('1 errors · 1 warnings · 1 notes')
    expect(getById('verify-close')).toHaveTextContent('Close')
})
