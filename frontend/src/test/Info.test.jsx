// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import Info, {ContactForm, mailtoUrl} from '../Info.jsx'
import {ExportDialog, EXPORT_TYPES, importKind} from '../ImportExport.jsx'

const byId = (id) => document.getElementById(id)
const api = (info) => {
    global.fetch = vi.fn(async () => (info ? {ok: true, json: async () => info} : {ok: false}))
}
const fill = (name = 'Jan', message = 'Mooie tool!') => {
    fireEvent.change(byId('contact-name'), {target: {value: name}})
    fireEvent.change(byId('contact-message'), {target: {value: message}})
}

describe('Info page', () => {
    test('shows about, how-to, faq, contact and donate sections', async () => {
        api({donateUrl: 'https://www.paypal.com/donate/?hosted_button_id=ABC', contactEmail: 'me@example.be'})
        render(<Info />)
        for (const id of ['info-over', 'info-gebruik', 'info-faq', 'info-contact', 'info-steun']) expect(byId(id)).not.toBeNull()
        screen.getByText('Hoe gebruik je Plugged?')
        screen.getByText('Sneltoetsen')
        expect(document.querySelectorAll('details.faq').length).toBeGreaterThan(3)
        screen.getByText('Wordt mijn werk automatisch bewaard?')
        await waitFor(() => expect(byId('donate-button')).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=ABC'))
        expect(byId('donate-button')).toHaveAttribute('target', '_blank')
        expect(byId('donate-button').getAttribute('rel')).toContain('noopener')
        await screen.findByLabelText('Naam')
    })
    test('the navigation scrolls to a section (and copes with a browser without scrollIntoView)', () => {
        api(null)
        render(<Info />)
        fireEvent.click(byId('nav-info-faq')) // jsdom has no scrollIntoView
        const f = vi.fn()
        byId('info-faq').scrollIntoView = f
        fireEvent.click(byId('nav-info-faq'))
        expect(f).toHaveBeenCalledTimes(1)
    })
    test('without a PayPal url the donate button is disabled; without a contact address there is no form', async () => {
        api({donateUrl: '', contactEmail: ''})
        render(<Info />)
        await screen.findByText(/niet ingesteld/)
        expect(byId('donate-button')).toBeDisabled()
        expect(byId('contact-form')).toBeNull()
    })
    test('an unreachable or failing /api/info leaves the defaults', async () => {
        api(null)
        const {unmount} = render(<Info />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/info'))
        expect(byId('donate-button')).toBeDisabled()
        unmount()
        global.fetch = vi.fn(async () => {
            throw new Error('offline')
        })
        render(<Info />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        expect(byId('contact-disabled')).not.toBeNull()
    })
    test('missing fields in /api/info are treated as not configured', async () => {
        api({})
        render(<Info />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        expect(byId('donate-button')).toBeDisabled()
        expect(byId('contact-form')).toBeNull()
    })
})

describe('Contact form', () => {
    const click = () => vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    test('opens the mail program with a new message to the configured address, and sends nothing itself', () => {
        const spy = click()
        global.fetch = vi.fn()
        render(<ContactForm to="me@example.be" />)
        fill('Jan Peeters', 'Mooie tool!\nMet een tweede regel & een "citaat"')
        let href
        spy.mockImplementation(function () {
            href = this.href
        })
        fireEvent.submit(byId('contact-form'))
        expect(spy).toHaveBeenCalledTimes(1)
        expect(href.startsWith('mailto:me@example.be?')).toBe(true)
        const q = new URLSearchParams(href.slice(href.indexOf('?') + 1))
        expect(q.get('subject')).toBe('Plugged - Jan Peeters')
        expect(q.get('body')).toBe('Mooie tool!\nMet een tweede regel & een "citaat"\n\nJan Peeters')
        expect(global.fetch).not.toHaveBeenCalled()
        expect(byId('contact-hint').textContent).toMatch(/zou nu moeten openen/)
    })
    test('the name is optional', () => {
        const spy = click()
        render(<ContactForm to="me@example.be" />)
        fill('  ', '  Hallo!  ')
        expect(mailtoUrl('me@example.be', '', 'Hallo!')).toBe('mailto:me@example.be?subject=Plugged&body=Hallo!')
        fireEvent.submit(byId('contact-form'))
        expect(spy).toHaveBeenCalledTimes(1)
    })
    test('shows the address as a fallback when no mail program opens', () => {
        click()
        render(<ContactForm to="me@example.be" />)
        expect(byId('contact-hint').textContent).toMatch(/niets via Plugged verstuurd/)
        expect(byId('contact-address')).toHaveAttribute('href', 'mailto:me@example.be')
        expect(byId('contact-address')).toHaveTextContent('me@example.be')
    })
    test('the message is required and limited', () => {
        render(<ContactForm to="me@example.be" />)
        expect(byId('contact-message')).toBeRequired()
        expect(byId('contact-message')).toHaveAttribute('maxlength', '1500')
    })
})

describe('Export dialog and import detection', () => {
    test('lists the file types and exports the chosen one', () => {
        const onExport = vi.fn(),
            onClose = vi.fn()
        render(<ExportDialog onExport={onExport} onClose={onClose} />)
        expect(EXPORT_TYPES.map((t) => t.id)).toEqual(['json', 'eds'])
        expect(document.activeElement).toBe(byId('export-type-json'))
        fireEvent.click(byId('export-confirm'))
        expect(onExport).toHaveBeenLastCalledWith('json')
        fireEvent.click(byId('export-type-eds'))
        expect(byId('export-type-eds')).toBeChecked()
        fireEvent.click(byId('export-confirm'))
        expect(onExport).toHaveBeenLastCalledWith('eds')
        fireEvent.click(byId('export-type-json'))
        fireEvent.click(byId('export-confirm'))
        expect(onExport).toHaveBeenLastCalledWith('json')
        expect(onClose).not.toHaveBeenCalled()
    })
    test.each([
        ['huis.EDS', '{}', 'eds'],
        ['x.json', 'EDS0040000', 'json'],
        ['x', 'EDS0040000abc', 'eds'],
        ['x', '{"een":[]}', 'json'],
        [undefined, 'EDS004', 'eds'],
        [undefined, '', 'json'],
    ])('importKind(%s, %s) is %s', (name, text, kind) => expect(importKind(name, text)).toBe(kind))
})
