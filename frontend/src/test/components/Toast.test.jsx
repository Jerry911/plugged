// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, render} from '@testing-library/react'
import Toast, {toastDuration, useToast} from '../../components/Toast.jsx'
import {getById} from '../utils.jsx'

let show
const Host = () => {
    const [toast, setToast] = useToast()
    show = setToast
    return <Toast toast={toast} />
}
const toast = () => getById('status-message').parentElement

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('a message shows at the bottom right and fades out after a while; the text stays for screen readers', () => {
    render(<Host />)
    expect(toast()).not.toHaveClass('shown')
    expect(toast()).toHaveAttribute('role', 'status')
    act(() => show('Opgeslagen'))
    expect(toast()).toHaveClass('shown')
    expect(getById('status-message')).toHaveTextContent('Opgeslagen')
    act(() => vi.advanceTimersByTime(toastDuration('Opgeslagen') + 10))
    expect(toast()).not.toHaveClass('shown')
    expect(getById('status-message')).toHaveTextContent('Opgeslagen')
})
test('the same message again shows the toast again; a function gets the current text', () => {
    render(<Host />)
    act(() => show('Automatisch opgeslagen om 16:13 ✓'))
    act(() => vi.advanceTimersByTime(9000))
    expect(toast()).not.toHaveClass('shown')
    act(() => show('Automatisch opgeslagen om 16:13 ✓'))
    expect(toast()).toHaveClass('shown')
    act(() => show((current) => current + '!'))
    expect(getById('status-message')).toHaveTextContent('Automatisch opgeslagen om 16:13 ✓!')
})
test('longer messages stay longer, between 3 and 8 seconds', () => {
    expect(toastDuration('')).toBe(3000)
    expect(toastDuration('x'.repeat(50))).toBe(5000)
    expect(toastDuration('x'.repeat(500))).toBe(8000)
})
