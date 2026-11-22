// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, waitFor} from '@testing-library/react'
import Info, {ContactForm, EDUCATIONAL_IMAGE, FEATURE_IMAGES, imageUrl, mailtoUrl, ROLE_ICONS, ROLE_IMAGE, SECTIONS, SOURCE_URL} from '../../../features/info/InfoPage.jsx'
import {ExportDialog, EXPORT_TYPES, importKind} from '../../../features/project/ExportDialog.jsx'
import {setLanguage, t, translation} from '../../../i18n/translate.js'
import {byId, getById} from '../../utils.jsx'
const api = (info) => {
    global.fetch = vi.fn(async () => (info ? {ok: true, json: async () => info} : {ok: false}))
}
const fill = (name = 'Jan', message = 'Mooie tool!') => {
    fireEvent.change(byId('contact-name'), {target: {value: name}})
    fireEvent.change(byId('contact-message'), {target: {value: message}})
}

describe('Info page', () => {
    test('the program for one computer has no QR code: only the FAQ says why', async () => {
        api({donateUrl: '', contactEmail: '', desktop: true})
        render(<Info />)
        await waitFor(() => expect(getById('info-faq').textContent).toContain(t('info.faq.desktopQr.question')))
        expect(byId('feature-qr')).toBeNull()
        expect(getById('info-sneltoetsen').textContent).not.toContain('Alt+Q')
        expect(getById('info-over').textContent).toContain(t('info.about.desktopIntro'))
        // apart from that one question nothing mentions it
        const withoutFaq = getById('info-page').textContent.replace(getById('info-faq').textContent, '')
        expect(withoutFaq).not.toMatch(/QR/)
        expect([...getById('info-faq').querySelectorAll('details')].filter((item) => /QR/.test(item.textContent))).toHaveLength(1)
    })
    test('shows every section, each in the navigation', async () => {
        api({donateUrl: 'https://www.paypal.com/donate/?hosted_button_id=ABC', contactEmail: 'me@example.be'})
        render(<Info />)
        expect(SECTIONS).toEqual(['info-over', 'info-functies', 'info-rollen', 'info-educatief', 'info-sneltoetsen', 'info-faq', 'info-contact', 'info-steun'])
        for (const id of SECTIONS) {
            expect(byId(id)).not.toBeNull()
            expect(getById('nav-' + id)).toHaveTextContent(t('info.sections.' + id))
        }
        // the shortcuts, with the QR code (Alt+Q), and the ten keys of the drawing tools (the same letters as the tips of the tool rail)
        expect(getById('info-sneltoetsen').querySelectorAll('kbd')).toHaveLength(translation('info.shortcuts.items').length + 10)
        expect(getById('info-sneltoetsen').textContent).toContain('Alt+Q')
        const muur = [...getById('info-sneltoetsen').querySelectorAll('dl > div')].find((row) => row.textContent.includes('Muur'))
        expect(muur.querySelector('kbd').textContent).toBe(t('situation.toolKeys.wall'))
        expect(muur.textContent).toContain('situatie- en het bedradingsschema')
        expect(document.querySelectorAll('details.faq').length).toBeGreaterThan(3)
        expect(getById('faq-1').querySelector('summary')).toHaveTextContent(translation('info.faq.questions')[0].question)
        await waitFor(() => expect(byId('donate-button')).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=ABC'))
        expect(byId('donate-button')).toHaveAttribute('target', '_blank')
        expect(byId('donate-button').getAttribute('rel')).toContain('noopener')
        await waitFor(() => getById('contact-name'))
    })
    test.each(['nl', 'fr', 'en'])('explains the QR code for the circuit board in plain words (%s): in About, in How to use and in the FAQ', (language) => {
        api(null)
        setLanguage(language)
        try {
            render(<Info />)
            expect(getById('info-over').textContent).toMatch(/QR/)
            const qrStep = translation('info.features.items').find((feature) => feature.id === 'qr')
            expect(qrStep.title).toMatch(/QR/)
            expect(getById('feature-qr').textContent).toContain('Alt')
            expect(qrStep.text).toMatch(/\[\[Alt\]\]\+\[\[Q\]\]/)
            // the FAQ answers what somebody who scans sees, whether a change needs a new code, and where the code works
            const questions = translation('info.faq.questions').filter((question) => /QR/.test(question.question))
            expect(questions.length).toBeGreaterThanOrEqual(3)
            questions.forEach((question) => expect(document.body.textContent).toContain(question.question))
            // not too technical: no talk of headers, endpoints or keys in hexadecimal
            ;[getById('info-over').textContent, qrStep.text, ...questions.map((question) => question.answer)].forEach((text) =>
                expect(text).not.toMatch(/X-Schema-Key|\/api\/|endpoint|header|localStorage/i),
            )
        } finally {
            setLanguage('nl')
        }
    })
    test('the tour button at the top starts the tour whenever the person wants, and is absent when there is no tour', () => {
        api(null)
        const start = vi.fn()
        const {unmount} = render(<Info onTour={start} />)
        fireEvent.click(byId('btn-tour'))
        fireEvent.click(byId('btn-tour'))
        expect(start).toHaveBeenCalledTimes(2)
        // it is the first thing on the page, above the navigation
        expect(byId('btn-tour').compareDocumentPosition(document.querySelector('.infonav')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        unmount()
        render(<Info />)
        expect(byId('btn-tour')).toBeNull()
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
        await waitFor(() => getById('contact-disabled'))
        expect(byId('donate-button')).toBeDisabled()
        expect(byId('contact-form')).toBeNull()
    })
    test('an unreachable or failing /api/info leaves the defaults', async () => {
        api(null)
        const {unmount} = render(<Info />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/info', {headers: {'Accept-Language': 'nl'}}))
        expect(byId('donate-button')).toBeDisabled()
        unmount()
        global.fetch = vi.fn(async () => {
            throw new Error('offline')
        })
        render(<Info />)
        await waitFor(() => expect(global.fetch).toHaveBeenCalled())
        expect(byId('contact-disabled')).not.toBeNull()
    })
    test('the donate button is at the top and again at the bottom, next to the link to the source code', async () => {
        api({donateUrl: 'https://www.paypal.com/donate/?hosted_button_id=ABC', contactEmail: ''})
        render(<Info onTour={() => {}} />)
        await waitFor(() => expect(byId('donate-button')).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=ABC'))
        // at the top: in the header, before the navigation and the first section
        expect(getById('info-hero').contains(byId('donate-button'))).toBe(true)
        expect(byId('donate-button').compareDocumentPosition(byId('info-over')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(byId('donate-button')).toHaveClass('big')
        expect(byId('donate-button-bottom')).toHaveAttribute('href', 'https://www.paypal.com/donate/?hosted_button_id=ABC')
        expect(getById('info-steun').contains(byId('donate-button-bottom'))).toBe(true)
        // the navigation has its own button to the support section
        expect(byId('nav-info-steun')).toHaveClass('navdonate')
        for (const id of ['source-link', 'source-link-bottom']) {
            expect(byId(id)).toHaveAttribute('href', SOURCE_URL)
            expect(byId(id)).toHaveAttribute('target', '_blank')
            expect(byId(id).getAttribute('rel')).toContain('noopener')
            expect(byId(id)).toHaveTextContent(t('info.hero.source'))
        }
        expect(SOURCE_URL).toBe('https://github.com/Jerry911/plugged')
        // and About says where the source code is
        expect(getById('info-over').textContent).toContain('GitHub')
    })
    test('every feature has its text and points, and its screenshots where it has them', () => {
        api(null)
        render(<Info />)
        const features = translation('info.features.items')
        expect(features.map((feature) => feature.id)).toEqual(Object.keys(FEATURE_IMAGES))
        for (const feature of features) {
            const article = getById('feature-' + feature.id)
            expect(article.querySelector('h3')).toHaveTextContent(feature.title)
            expect(article.querySelectorAll('.points li')).toHaveLength(feature.points?.length ?? 0)
            expect([...article.querySelectorAll('.shot img')].map((image) => image.getAttribute('src'))).toEqual(FEATURE_IMAGES[feature.id].map((name) => imageUrl('nl', name)))
            article.querySelectorAll('.shot img').forEach((image) => {
                expect(image).toHaveAttribute('loading', 'lazy')
                // its size is known before it loads, so the page does not shift
                expect(Number(image.getAttribute('width'))).toBeGreaterThan(100)
                expect(Number(image.getAttribute('height'))).toBeGreaterThan(100)
                expect(image).toHaveAttribute('alt', feature.title)
            })
        }
        expect(getById('info-rollen').querySelector('.shot img').getAttribute('src')).toBe(imageUrl('nl', ROLE_IMAGE))
        expect(getById('info-educatief').querySelector('.shot img').getAttribute('src')).toBe(imageUrl('nl', EDUCATIONAL_IMAGE))
    })
    test('every feature, role and the educational mode has a line icon in the text colour (no emoji, which some systems draw dark)', () => {
        api(null)
        render(<Info />)
        for (const feature of translation('info.features.items')) {
            const icon = getById('feature-' + feature.id).querySelector('.featureicon svg')
            expect(icon, feature.id).not.toBeNull()
            expect(icon).toHaveAttribute('stroke', 'currentColor')
            expect(icon.querySelectorAll('path, circle').length).toBeGreaterThan(0)
        }
        const roles = [...document.querySelectorAll('.roleicon svg')]
        expect(roles.map((icon) => icon.getAttribute('data-icon'))).toEqual(ROLE_ICONS)
        expect(getById('info-educatief').querySelector('h2 svg')).not.toBeNull()
        // no emoji left in the icons
        document.querySelectorAll('.featureicon, .roleicon').forEach((circle) => expect(circle.textContent.trim()).toBe(''))
    })
    test('a click on a screenshot shows it large; Escape, the cross or a click closes it again', () => {
        api(null)
        render(<Info />)
        fireEvent.click(byId('shot-qr'))
        expect(getById('info-lightbox').querySelector('img').getAttribute('src')).toBe(imageUrl('nl', 'qr'))
        expect(byId('info-lightbox')).toHaveAttribute('aria-label', translation('info.features.items').find((feature) => feature.id === 'qr').title)
        fireEvent.keyDown(document.body, {key: 'Escape'})
        expect(byId('info-lightbox')).toBeNull()
        fireEvent.click(byId('shot-projecten'))
        fireEvent.click(byId('info-lightbox-close'))
        expect(byId('info-lightbox')).toBeNull()
        fireEvent.click(byId('shot-groepen'))
        fireEvent.click(byId('info-lightbox'))
        expect(byId('info-lightbox')).toBeNull()
    })
    test('a screenshot that is missing (not made yet) leaves no empty frame', () => {
        api(null)
        render(<Info />)
        fireEvent.error(byId('shot-componenten').querySelector('img'))
        expect(byId('shot-componenten')).toBeNull()
        expect(getById('feature-componenten').querySelector('h3')).not.toBeNull()
    })
    test('roles, groups and the educational mode: what a student cannot and can do', () => {
        api(null)
        render(<Info />)
        expect([...document.querySelectorAll('.role h3')].map((title) => title.textContent)).toEqual(translation('info.roles.items').map((role) => role.title))
        expect(getById('info-educatief').querySelectorAll('.cannot li')).toHaveLength(translation('info.educational.cannot').length)
        expect(getById('info-educatief').querySelectorAll('.can li')).toHaveLength(translation('info.educational.can').length)
        // the things the question was about: no checking, no import or export, and PDF and print stay
        expect(getById('info-educatief').querySelector('.cannot').textContent).toMatch(/controleren/i)
        expect(getById('info-educatief').querySelector('.cannot').textContent).toMatch(/exporteren/i)
        expect(getById('info-educatief').querySelector('.can').textContent).toMatch(/PDF/)
        // bold text is shown bold, not with its stars
        expect(getById('info-educatief').textContent).not.toContain('**')
        expect(getById('info-functies').textContent).not.toContain('**')
        expect(getById('info-rollen').textContent).not.toContain('**')
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
        expect(byId('contact-hint').textContent).toContain(t('info.contact.opened'))
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
        expect(byId('contact-hint').textContent).toContain(t('info.contact.explanation'))
        expect(byId('contact-address')).toHaveAttribute('href', 'mailto:me@example.be')
        expect(byId('contact-address')).toHaveTextContent('me@example.be')
    })
    test('the message is required and limited', () => {
        render(<ContactForm to="me@example.be" />)
        expect(byId('contact-message')).toBeRequired()
        expect(byId('contact-message')).toHaveAttribute('maxlength', '1500')
    })
})

describe('Info page in other languages', () => {
    test('every section, feature, role, shortcut and question is translated, with the same structure', async () => {
        api(null)
        for (const [language, title] of [
            ['fr', 'Que pouvez-vous faire avec Plugged ?'],
            ['en', 'What can you do with Plugged?'],
        ]) {
            setLanguage(language)
            try {
                const {unmount} = render(<Info onTour={() => {}} />)
                expect(getById('info-functies').querySelector('h2')).toHaveTextContent(title)
                const ids = (lang) => translation('info.features.items', lang).map((feature) => feature.id)
                expect(ids(language)).toEqual(ids('nl'))
                translation('info.features.items', language).forEach((feature, index) =>
                    expect(feature.points?.length ?? 0, feature.id).toBe(translation('info.features.items', 'nl')[index].points?.length ?? 0),
                )
                expect(document.querySelectorAll('article.feature')).toHaveLength(ids('nl').length)
                expect(document.querySelectorAll('.role')).toHaveLength(translation('info.roles.items', 'nl').length)
                expect(translation('info.educational.cannot', language)).toHaveLength(translation('info.educational.cannot', 'nl').length)
                expect(getById('info-sneltoetsen').querySelectorAll('kbd')).toHaveLength(translation('info.shortcuts.items', 'nl').length + 10)
                expect(document.querySelectorAll('details.faq')).toHaveLength(translation('info.faq.questions', 'nl').length)
                expect(getById('btn-tour')).toHaveTextContent(t('info.startTour'))
                // the screenshots are those of the language
                expect(byId('shot-eendraadschema').querySelector('img').getAttribute('src')).toBe(imageUrl(language, 'eendraadschema'))
                unmount()
            } finally {
                setLanguage('nl')
            }
        }
    })
})

describe('Export dialog and import detection', () => {
    test('lists the file types and exports the chosen one', () => {
        const onExport = vi.fn(),
            onClose = vi.fn()
        render(<ExportDialog onExport={onExport} onClose={onClose} />)
        expect(EXPORT_TYPES).toEqual(['json', 'eds', 'svg', 'png'])
        // every type has its label and hint
        for (const id of EXPORT_TYPES) expect(byId('export-type-' + id).closest('label').textContent).toContain(t(`export.types.${id}.label`))
        for (const id of ['svg', 'png']) {
            fireEvent.click(byId('export-type-' + id))
            fireEvent.click(byId('export-confirm'))
            expect(onExport).toHaveBeenLastCalledWith(id)
        }
        expect(document.activeElement).toBe(byId('export-type-json'))
        fireEvent.click(byId('export-type-json'))
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
