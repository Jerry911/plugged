// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account › Prijzen and Project › Offerte.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import PricingPanel from '../../../features/pricing/PricingPanel.jsx'
import QuoteDialog, {newQuoteDetails} from '../../../features/quote/QuoteDialog.jsx'
import {money, quotePdf, quoteRows, quoteXlsx, validUntil} from '../../../features/quote/quoteExport.js'
import {newPriceList} from '../../../model/pricing.js'
import {quoteOf} from '../../../model/quote.js'
import {t} from '../../../i18n/translate.js'
import {byId, getById} from '../../utils.jsx'
import {strFromU8, unzipSync} from 'fflate'

vi.mock('jspdf', () => ({
    jsPDF: class {
        constructor() {
            this.texts = []
        }
        text(value) {
            this.texts.push(value)
        }
        setFont() {}
        setFontSize() {}
        setFillColor() {}
        rect() {}
        line() {}
        addPage() {}
        setPage() {}
        getNumberOfPages() {
            return 1
        }
        splitTextToSize(text) {
            return [text]
        }
        output() {
            return new ArrayBuffer(8)
        }
    },
}))

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const PROJECT = {
    name: 'Kerkstraat',
    footer: {eigenaar: 'Testa Voorbeeldenaar', straat: 'Kerkstraat', nr: '1', postcode: '9000', gemeente: 'Gent'},
    een: [{id: 'e1', name: 'B', tree: [{id: 'k', type: 'kring', label: 'A', children: [{id: 's', type: 'stopcontact_pekid', children: []}], p: {polen: '2', amp: '20', curve: 'B', bescherming: 'automatisch'}}]}],
    sit: [{id: 'p', name: 'Plan', walls: [], items: []}],
}

test('Prijzen: a new price list comes with the usual articles; prices are filled in and saved on top of its version', async () => {
    const stored = {id: 5, name: t('pricing.newName'), mine: true, owner: null, groups: [], updated: '', version: 0, document: newPriceList()}
    const calls = []
    global.fetch = vi.fn(async (url, options = {}) => {
        calls.push([options.method || 'GET', url, options.headers?.['If-Match'], options.body && JSON.parse(options.body)])
        if (url === '/api/price-lists/groups') return json([{id: 3, name: 'Firma'}])
        if (url === '/api/price-lists') return options.method === 'POST' ? json(stored, 201) : json(calls.some((call) => call[0] === 'POST') ? [stored] : [])
        if (url === '/api/price-lists/5') return options.method === 'PUT' ? json({...stored, version: 1}) : json(stored)
        return json(null, 404)
    })
    render(<PricingPanel />)
    await waitFor(() => getById('pricing-intro'))
    fireEvent.click(getById('pricing-new'))
    await waitFor(() => getById('article-socket'))
    expect(calls.find((call) => call[0] === 'POST')[3].document.articles.length).toBeGreaterThan(30)
    expect(getById('pricing-missing')).toHaveTextContent(t('pricing.missingPrices', {count: stored.document.articles.length}))
    fireEvent.change(getById('article-socket').querySelector('input.price'), {target: {value: '3,45'}})
    fireEvent.click(getById('pricing-groups').querySelector('input'))
    fireEvent.click(getById('pricing-tab-labour'))
    fireEvent.change(getById('pricing-hourly'), {target: {value: '55'}})
    await act(async () => fireEvent.click(getById('pricing-save')))
    const put = calls.find((call) => call[0] === 'PUT')
    expect(put[2]).toBe('"0"')
    expect(put[3].groupIds).toEqual([3])
    expect(put[3].document.labour.hourly).toBe('55')
    expect(put[3].document.articles.find((article) => article.id === 'socket').price).toBe('3,45')
    await waitFor(() => expect(getById('pricing-status')).toHaveTextContent(t('pricing.saved')))
    // the other parts are there
    fireEvent.click(getById('pricing-tab-symbols'))
    expect(getById('recipe-stopcontact2')).toBeTruthy()
    fireEvent.click(getById('pricing-tab-frames'))
    expect(getById('frame-v-3').value).toBe('frame3v')
    fireEvent.click(getById('pricing-tab-company'))
    fireEvent.change(getById('company-name'), {target: {value: 'Elektro Voorbeeld'}})
    expect(getById('pricing-save')).not.toBeDisabled()
})

test('Prijzen: a price list shared by somebody else is read-only and can be copied', async () => {
    const shared = {id: 7, name: 'Firma', mine: false, owner: 'Jan Peeters', groups: [{id: 3, name: 'Firma'}], updated: '', version: 2, document: newPriceList()}
    global.fetch = vi.fn(async (url) => (url === '/api/price-lists' ? json([shared]) : url === '/api/price-lists/groups' ? json([]) : json(shared)))
    render(<PricingPanel />)
    await waitFor(() => expect(getById('pricing-readonly')).toHaveTextContent('Jan Peeters'))
    expect(byId('pricing-delete')).toBeNull()
    expect(getById('pricing-name')).toBeDisabled()
    expect(getById('pricing-copy')).not.toBeDisabled()
})

test('Offerte: from the title block and the price list, with what is not priced yet and the totals; the details are kept in the project', async () => {
    const list = newPriceList()
    list.articles = list.articles.map((article) => ({...article, price: article.id === 'socket' ? '4' : article.price}))
    list.labour.hourly = 50
    list.company = {name: 'Elektro Voorbeeld'}
    global.fetch = vi.fn(async (url) =>
        url === '/api/price-lists' ? json([{id: 5, name: 'Mijn prijzen', mine: true, groups: []}]) : json({id: 5, name: 'Mijn prijzen', mine: true, groups: [], version: 1, document: list}),
    )
    let project = PROJECT
    const changes = vi.fn((quote) => (project = {...project, quote}))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const {rerender} = render(<QuoteDialog project={project} projectId={3} onChange={changes} onClose={() => {}} onManagePrices={() => {}} />)
    await waitFor(() => expect(changes).toHaveBeenCalled())
    expect(project.quote).toMatchObject({client: 'Testa Voorbeeldenaar', clientAddress: 'Kerkstraat 1, 9000 Gent', vat: 21, priceList: 5})
    rerender(<QuoteDialog project={project} projectId={3} onChange={changes} onClose={() => {}} onManagePrices={() => {}} />)
    await waitFor(() => getById('quote-lines'))
    expect(getById('quote-lines')).toHaveTextContent(t('pricing.standard.socket'))
    expect(getById('quote-problems')).toHaveTextContent(t('quote.problems.noPrice', {name: t('pricing.standard.plateSocket')}))
    fireEvent.change(getById('quote-vat'), {target: {value: '6'}})
    expect(project.quote.vat).toBe(6)
    rerender(<QuoteDialog project={project} projectId={3} onChange={changes} onClose={() => {}} onManagePrices={() => {}} />)
    await waitFor(() => expect(getById('quote-vat-amount').previousSibling).toHaveTextContent(t('quote.vatOf', {rate: 6})))
    fireEvent.click(getById('quote-pdf'))
    fireEvent.click(getById('quote-xlsx'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
})

test('Offerte: without a price list the dialog sends the user to Prijzen', async () => {
    global.fetch = vi.fn(async () => json([]))
    const manage = vi.fn()
    render(<QuoteDialog project={PROJECT} projectId={3} onChange={() => {}} onClose={() => {}} onManagePrices={manage} />)
    await waitFor(() => getById('quote-no-lists'))
    fireEvent.click(getById('quote-manage'))
    expect(manage).toHaveBeenCalled()
})

test('the offerte as Excel: the lines by group with amounts, the totals and the VAT', () => {
    const list = newPriceList()
    list.articles = list.articles.map((article) => ({...article, price: 1}))
    const quote = quoteOf(PROJECT, list, {vat: 0, labour: false}),
        details = {...newQuoteDetails(PROJECT, list), number: 'OFF-1', date: '2026-11-22', validDays: 30}
    expect(validUntil('2026-11-22', 30)).toBe('2026-12-22')
    expect(quoteRows(quote, 'nl-BE')[0]).toEqual({heading: t('pricing.groups.mechanism')})
    expect(money(1234.5, 'nl-BE')).toMatch(/1\.234,50/)
    const sheet = strFromU8(unzipSync(quoteXlsx(quote, details, {name: 'Elektro'}, 'nl-BE'))['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('OFF-1')
    expect(sheet).toContain(t('quote.vatShiftedNote'))
    expect(sheet).toContain('s="5"')
})

test('Offerte: a new version keeps the earlier one listed; a deposit and options picked from the price list show apart from the total', async () => {
    const list = newPriceList()
    list.articles = list.articles.map((article) => ({...article, price: article.id === 'socket' ? '4' : '2'}))
    list.labour.hourly = 50
    global.fetch = vi.fn(async (url) =>
        url === '/api/price-lists' ? json([{id: 5, name: 'Mijn prijzen', mine: true, groups: []}]) : json({id: 5, name: 'Mijn prijzen', mine: true, groups: [], version: 1, document: list}),
    )
    let project = {...PROJECT, quote: {...newQuoteDetails(PROJECT, list), number: 'OFF-7', date: '2026-11-02', margin: 10, priceList: 5}}
    const changes = vi.fn((quote) => (project = {...project, quote}))
    const again = () => rerender(<QuoteDialog project={project} projectId={3} onChange={changes} onClose={() => {}} onManagePrices={() => {}} />)
    const {rerender} = render(<QuoteDialog project={project} projectId={3} onChange={changes} onClose={() => {}} onManagePrices={() => {}} />)
    await waitFor(() => getById('quote-lines'))
    expect(getById('quote-version')).toHaveTextContent('v1')
    const firstTotal = getById('quote-total').textContent
    // a new version: v2, dated today, the first one listed with its total
    fireEvent.click(getById('quote-new-version'))
    again()
    expect(project.quote).toMatchObject({version: 2, date: new Date().toISOString().slice(0, 10)})
    expect(project.quote.versions).toEqual([{version: 1, date: '2026-11-02', total: expect.any(Number)}])
    expect(getById('quote-version')).toHaveTextContent('v2')
    expect(getById('quote-versions')).toHaveTextContent('v1')
    expect(getById('quote-versions').textContent).toContain(firstTotal)
    // a deposit of 30 %
    fireEvent.change(getById('quote-deposit'), {target: {value: '30'}})
    again()
    await waitFor(() => getById('quote-deposit-amount'))
    expect(getById('quote-balance')).toBeTruthy()
    // an option from the price list: its price with the margin (2 + 10 %), outside the total
    const total = getById('quote-total').textContent
    fireEvent.change(getById('quote-optional-article'), {target: {value: 'socket'}})
    again()
    expect(project.quote.optional).toEqual([{text: t('pricing.standard.socket'), qty: 1, price: '4,4'}])
    await waitFor(() => getById('quote-optional-lines'))
    expect(getById('quote-optional-subtotal').textContent).toBe(money(4.4, 'nl-BE'))
    expect(getById('quote-total').textContent).toBe(total)
    // and a typed one
    fireEvent.click(getById('quote-optional-add'))
    again()
    expect(project.quote.optional).toHaveLength(2)
})

test('the offerte as Excel with its version, deposit and options', () => {
    const list = newPriceList()
    list.articles = list.articles.map((article) => ({...article, price: 1}))
    const quote = quoteOf(PROJECT, list, {vat: 21, labour: false, deposit: 25, optional: [{text: 'Laadpaal', price: 900}]}),
        details = {...newQuoteDetails(PROJECT, list), number: 'OFF-1', version: 3, date: '2026-11-22', validDays: 30}
    const sheet = strFromU8(unzipSync(quoteXlsx(quote, details, {name: 'Elektro'}, 'nl-BE'))['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('OFF-1 v3')
    expect(sheet).toContain(t('quote.depositLine', {percent: 25}))
    expect(sheet).toContain(t('quote.balanceLine'))
    expect(sheet).toContain(t('quote.optionalTitle'))
    expect(sheet).toContain('Laadpaal')
    // the PDF draws too
    expect(() => quotePdf(quote, details, {name: 'Elektro'}, 'nl-BE')).not.toThrow()
})
