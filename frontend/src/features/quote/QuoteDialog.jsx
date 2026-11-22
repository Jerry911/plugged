// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Project › Offerte: an offerte of the open project with one of the price lists of the user (model/quote.js). The details (number, date,
// client, VAT, margin, extra lines, ...) are kept in the project (project.quote), so the next time they are there again. What cannot be
// priced is listed, with where to fix it; the offerte goes out as a PDF and as an Excel workbook.
import {useEffect, useMemo, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import Icon from '../../components/Icon.jsx'
import {fetchPriceList, fetchPriceLists} from '../../api/pricingApi.js'
import {VAT_RATES, normalizePriceList} from '../../model/pricing.js'
import {quoteOf} from '../../model/quote.js'
import {download} from '../project/materialsExport.js'
import {money, quotePdf, quoteRows, quoteXlsx} from './quoteExport.js'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const today = () => new Date().toISOString().slice(0, 10)

/** The details of a new offerte, from the title block of the project. */
export const newQuoteDetails = (project, list) => {
    const footer = project.footer || {}
    const street = [footer.straat, footer.nr].filter(Boolean).join(' '),
        city = [footer.postcode, footer.gemeente].filter(Boolean).join(' ')
    return {
        number: 'OFF-' + today().replace(/-/g, '').slice(0, 6) + '-' + String(Math.floor(Math.random() * 900) + 100),
        date: today(),
        validDays: list?.validDays ?? 30,
        client: footer.eigenaar || '',
        clientAddress: [street, city].filter(Boolean).join(', '),
        site: [street, city].filter(Boolean).join(', '),
        vat: list?.vat ?? 21,
        margin: list?.margin ?? 0,
        labour: true,
        extras: [],
        intro: '',
    }
}

export default function QuoteDialog({project, projectId, onChange, onClose, onManagePrices}) {
    const {t, locale} = useTranslation()
    const [lists, setLists] = useState(undefined),
        [list, setList] = useState(null)
    const details = project.quote || null
    const listId = details?.priceList ?? lists?.[0]?.id
    useEffect(() => {
        fetchPriceLists().then(setLists)
    }, [])
    useEffect(() => {
        if (listId == null) return
        let live = true
        fetchPriceList(listId).then((found) => live && setList(found ? {...found, document: normalizePriceList(found.document)} : null))
        return () => {
            live = false
        }
    }, [listId])
    // the details start from the title block and the price list the first time
    useEffect(() => {
        if (!details && list) onChange({...newQuoteDetails(project, list.document), priceList: list.id})
    }, [details, list])
    const set = (patch) => onChange({...(details || newQuoteDetails(project, list?.document)), ...patch})
    const quote = useMemo(
        () => (list && details ? quoteOf(project, list.document, {margin: details.margin, vat: details.vat, extras: details.extras, labour: details.labour}) : null),
        [project, list, details],
    )
    const company = list?.document.company || {}
    const fileName = (extension) =>
        [t('quote.fileName'), details?.number, project.name || (projectId ? String(projectId) : '')]
            .filter(Boolean)
            .join('-')
            .replace(/[^\p{L}\p{N}._-]+/gu, '-')
            .replace(/-+/g, '-') +
        '.' +
        extension
    return (
        <div id="quote-dialog" className="dlg ui quotedlg" role="dialog" aria-label={t('quote.title')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
            <div className="tb">
                <b>{t('quote.title')}</b>
                <button id="quote-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                    <Icon name="close" />
                </button>
            </div>
            {lists === undefined && <p>{t('auth.loading')}</p>}
            {lists === null && <p id="quote-unavailable">{t('pricing.unavailable')}</p>}
            {lists?.length === 0 && (
                <p id="quote-no-lists">
                    {t('quote.noLists')}{' '}
                    <button id="quote-manage" onClick={onManagePrices}>
                        {t('quote.managePrices')}
                    </button>
                </p>
            )}
            {lists?.length > 0 && details && (
                <div className="quotebody">
                    <div className="quotefields">
                        <label>
                            {t('quote.priceList')}
                            <select id="quote-pricelist" value={listId ?? ''} onChange={(event) => set({priceList: Number(event.target.value)})}>
                                {lists.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                        {candidate.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {t('quote.number')}
                            <input id="quote-number" value={details.number} onChange={(event) => set({number: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.date')}
                            <input id="quote-date" type="date" value={details.date} onChange={(event) => set({date: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.validDays')}
                            <input id="quote-valid" inputMode="numeric" value={details.validDays} onChange={(event) => set({validDays: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.client')}
                            <input id="quote-client" value={details.client} onChange={(event) => set({client: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.clientAddress')}
                            <input id="quote-client-address" value={details.clientAddress} onChange={(event) => set({clientAddress: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.site')}
                            <input id="quote-site" value={details.site} onChange={(event) => set({site: event.target.value})} />
                        </label>
                        <label>
                            {t('quote.vat')}
                            <select id="quote-vat" value={details.vat} onChange={(event) => set({vat: Number(event.target.value)})}>
                                {VAT_RATES.map((rate) => (
                                    <option key={rate} value={rate}>
                                        {t('quote.vatRates.' + rate)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {t('quote.margin')}
                            <input id="quote-margin" inputMode="decimal" value={details.margin} onChange={(event) => set({margin: event.target.value})} />
                        </label>
                        <label className="check">
                            <input id="quote-labour" type="checkbox" checked={details.labour !== false} onChange={(event) => set({labour: event.target.checked})} /> {t('quote.withLabour')}
                        </label>
                        <label className="wide">
                            {t('quote.intro')}
                            <textarea id="quote-intro" rows={2} placeholder={company.intro || ''} value={details.intro || ''} onChange={(event) => set({intro: event.target.value})} />
                        </label>
                    </div>
                    <div id="quote-extras" className="quoteextras">
                        <b>{t('quote.extras')}</b>
                        {(details.extras || []).map((extra, index) => {
                            const update = (patch) => set({extras: details.extras.map((other, at) => (at === index ? {...other, ...patch} : other))})
                            return (
                                <span key={index} className="extra">
                                    <input className="text" placeholder={t('quote.extraText')} aria-label={t('quote.extraText')} value={extra.text} onChange={(event) => update({text: event.target.value})} />
                                    <input className="num" aria-label={t('quote.columns.qty')} value={extra.qty} onChange={(event) => update({qty: event.target.value})} />
                                    <input className="num" aria-label={t('quote.columns.price')} placeholder="0,00" value={extra.price} onChange={(event) => update({price: event.target.value})} />
                                    <button className="danger" aria-label={t('quote.removeExtra')} onClick={() => set({extras: details.extras.filter((_, at) => at !== index)})}>
                                        ×
                                    </button>
                                </span>
                            )
                        })}
                        <button id="quote-add-extra" onClick={() => set({extras: [...(details.extras || []), {text: '', qty: 1, price: ''}]})}>
                            {t('quote.addExtra')}
                        </button>
                    </div>
                    {!quote && <p>{t('auth.loading')}</p>}
                    {quote && (
                        <>
                            {quote.problems.length > 0 && (
                                <div id="quote-problems" className="quoteproblems">
                                    <b>{t('quote.problemsTitle', {count: quote.problems.length})}</b>
                                    <ul>
                                        {quote.problems.map((problem, index) => (
                                            <li key={index}>
                                                {t('quote.problems.' + problem.kind, {
                                                    ...problem,
                                                    direction: t(problem.direction === 'v' ? 'situation.vertical' : 'situation.horizontal').toLowerCase(),
                                                })}
                                            </li>
                                        ))}
                                    </ul>
                                    {list?.mine && (
                                        <button id="quote-fix-prices" onClick={() => onManagePrices(list.id)}>
                                            {t('quote.managePrices')}
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="quotetable">
                                <table id="quote-lines">
                                    <thead>
                                        <tr>
                                            <th>{t('quote.columns.description')}</th>
                                            <th className="num">{t('quote.columns.qty')}</th>
                                            <th>{t('quote.columns.unit')}</th>
                                            <th className="num">{t('quote.columns.price')}</th>
                                            <th className="num">{t('quote.columns.total')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quoteRows(quote, locale).map((row, index) =>
                                            row.heading ? (
                                                <tr key={index} className="heading">
                                                    <td colSpan={5}>{row.heading}</td>
                                                </tr>
                                            ) : (
                                                <tr key={index}>
                                                    <td>{row.text}</td>
                                                    <td className="num">{row.qtyText}</td>
                                                    <td>{row.unit}</td>
                                                    <td className="num">{money(row.price, locale)}</td>
                                                    <td className="num">{money(row.total, locale)}</td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={4}>{t('quote.subtotal')}</td>
                                            <td id="quote-subtotal" className="num">
                                                {money(quote.subtotal, locale)}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={4}>{quote.vat.rate === 0 ? t('quote.vatShifted') : t('quote.vatOf', {rate: quote.vat.rate})}</td>
                                            <td id="quote-vat-amount" className="num">
                                                {money(quote.vat.amount, locale)}
                                            </td>
                                        </tr>
                                        <tr className="total">
                                            <td colSpan={4}>{t('quote.total')}</td>
                                            <td id="quote-total" className="num">
                                                {money(quote.total, locale)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    )}
                    <div className="tb" style={{marginTop: 8}}>
                        <button id="quote-pdf" className="accent" disabled={!quote} onClick={() => download(quotePdf(quote, details, company, locale), fileName('pdf'), 'application/pdf')}>
                            {t('quote.downloadPdf')}
                        </button>{' '}
                        <button id="quote-xlsx" disabled={!quote} onClick={() => download(quoteXlsx(quote, details, company, locale), fileName('xlsx'), XLSX_TYPE)}>
                            {t('quote.downloadXlsx')}
                        </button>{' '}
                        <button id="quote-manage-prices" onClick={() => onManagePrices(listId)}>
                            {t('quote.managePrices')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
