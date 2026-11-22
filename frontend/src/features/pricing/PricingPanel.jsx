// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account › Prijzen: the price lists of the offertes (model/pricing.js). A list of one's own is edited here and can be shared with groups;
// a shared one is read-only (make a copy to change it). Parts: the articles with their prices and labour, what the symbols are made of,
// the cover frames, labour / margin / VAT, and the company on the offerte.
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {deletePriceList, fetchPriceList, fetchPriceListGroups, fetchPriceLists, storePriceList} from '../../api/pricingApi.js'
import {ARTICLE_GROUPS, MAX_FRAME_PLACES, PROTECTION_KINDS, VAT_RATES, newArticleId, newPriceList, normalizePriceList} from '../../model/pricing.js'
import {allTypes, symbolName} from '../../symbols/symbolLibrary.js'
import ArticleSelect from './ArticleSelect.jsx'

const SECTIONS = ['articles', 'symbols', 'frames', 'labour', 'company']
const NOT_A_SYMBOL = new Set(['kring', 'aansluiting', 'diff', 'zekering', 'hoofdschakelaar', 'leeg'])
const COMPANY_FIELDS = ['name', 'address', 'city', 'vat', 'iban', 'email', 'phone', 'website']
const LOGO_MAX = 600

/** A picture of the user as a PNG data URL of at most LOGO_MAX pixels wide or high (so the price list stays small). */
const logoOf = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload = () => {
            const image = new Image()
            image.onerror = reject
            image.onload = () => {
                const factor = Math.min(1, LOGO_MAX / Math.max(image.width, image.height)),
                    canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.round(image.width * factor))
                canvas.height = Math.max(1, Math.round(image.height * factor))
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL('image/png'))
            }
            image.src = reader.result
        }
        reader.readAsDataURL(file)
    })

export default function PricingPanel({initialId = null}) {
    const {t} = useTranslation()
    const [lists, setLists] = useState(null),
        [groups, setGroups] = useState([]),
        [open, setOpen] = useState(null), // {id, name, version, mine, owner, groups: [ids], document}
        [saved, setSaved] = useState(''),
        [section, setSection] = useState('articles'),
        [search, setSearch] = useState(''),
        [status, setStatus] = useState('')
    const load = useCallback(async (selectId) => {
        const [found, shareable] = await Promise.all([fetchPriceLists(), fetchPriceListGroups()])
        setLists(found)
        setGroups(shareable)
        const id = selectId ?? found?.[0]?.id
        if (id == null) return setOpen(null)
        const list = await fetchPriceList(id)
        if (!list) return setOpen(null)
        const state = {id: list.id, name: list.name, version: list.version, mine: list.mine, owner: list.owner, groups: list.groups.map((group) => group.id), document: normalizePriceList(list.document)}
        setOpen(state)
        setSaved(JSON.stringify(state))
    }, [])
    useEffect(() => {
        load(initialId)
    }, [load, initialId])
    const dirty = open && JSON.stringify(open) !== saved,
        readOnly = open && !open.mine
    const change = (patch) => setOpen((current) => ({...current, document: {...current.document, ...patch}}))
    const confirmLeave = () => !dirty || window.confirm(t('pricing.discard'))
    const create = async (document, name) => {
        const result = await storePriceList(null, 0, {name, document, groupIds: []})
        if (!result.ok) return setStatus(result.error || t('pricing.saveFailed'))
        setStatus(t('pricing.created', {name}))
        load(result.list.id)
    }
    const save = async () => {
        const result = await storePriceList(open.id, open.version, {name: open.name, document: open.document, groupIds: open.groups})
        if (!result.ok) return setStatus(result.conflict ? t('pricing.conflict') : result.error || t('pricing.saveFailed'))
        setStatus(t('pricing.saved'))
        load(result.list.id)
    }
    const remove = async () => {
        if (!window.confirm(t('pricing.deleteConfirm', {name: open.name}))) return
        setStatus((await deletePriceList(open.id)) ? t('pricing.deleted', {name: open.name}) : t('pricing.saveFailed'))
        load()
    }
    if (lists === null) return <p id="pricing-unavailable">{t('pricing.unavailable')}</p>
    const document = open?.document,
        articles = document?.articles || []
    const updateArticle = (id, patch) => change({articles: articles.map((article) => (article.id === id ? {...article, ...patch} : article))})
    return (
        <div id="pricing-panel" className="pricing">
            <div className="pricingbar">
                <select
                    id="pricing-list"
                    aria-label={t('pricing.list')}
                    value={open?.id ?? ''}
                    onChange={(event) => confirmLeave() && load(Number(event.target.value))}
                >
                    {lists.length === 0 && <option value="">{t('pricing.noLists')}</option>}
                    {lists.map((list) => (
                        <option key={list.id} value={list.id}>
                            {list.name}
                            {list.mine ? '' : ' (' + t('pricing.sharedBy', {owner: list.owner}) + ')'}
                        </option>
                    ))}
                </select>
                <button id="pricing-new" onClick={() => confirmLeave() && create(newPriceList(), t('pricing.newName'))}>
                    {t('pricing.new')}
                </button>
                {open && (
                    <button id="pricing-copy" onClick={() => confirmLeave() && create(open.document, t('pricing.copyName', {name: open.name}))}>
                        {t('pricing.copy')}
                    </button>
                )}
                {open?.mine && (
                    <button id="pricing-delete" className="danger" onClick={remove}>
                        {t('pricing.delete')}
                    </button>
                )}
            </div>
            {lists.length === 0 && <p id="pricing-intro">{t('pricing.intro')}</p>}
            {open && (
                <>
                    {readOnly && (
                        <p id="pricing-readonly" className="authmsg">
                            {t('pricing.readOnly', {owner: open.owner})}
                        </p>
                    )}
                    <fieldset disabled={readOnly} className="pricingfields">
                        <div className="pricingmeta">
                            <label>
                                {t('pricing.name')}
                                <input id="pricing-name" value={open.name} maxLength={200} onChange={(event) => setOpen({...open, name: event.target.value})} />
                            </label>
                            {groups.length > 0 && (
                                <span id="pricing-groups" className="pricinggroups">
                                    {t('pricing.share')}
                                    {groups.map((group) => (
                                        <label key={group.id} className="check">
                                            <input
                                                type="checkbox"
                                                checked={open.groups.includes(group.id)}
                                                onChange={(event) =>
                                                    setOpen({...open, groups: event.target.checked ? [...open.groups, group.id] : open.groups.filter((id) => id !== group.id)})
                                                }
                                            />{' '}
                                            {group.name}
                                        </label>
                                    ))}
                                </span>
                            )}
                            <button id="pricing-save" className="accent" disabled={!dirty || !open.name.trim()} onClick={save}>
                                {t('pricing.save')}
                            </button>
                        </div>
                        <div className="pricingtabs" role="tablist">
                            {SECTIONS.map((key) => (
                                <button key={key} id={'pricing-tab-' + key} role="tab" aria-selected={section === key} className={section === key ? 'on' : ''} onClick={() => setSection(key)}>
                                    {t('pricing.sections.' + key)}
                                </button>
                            ))}
                        </div>
                        {section === 'articles' && (
                            <Articles articles={articles} search={search} setSearch={setSearch} update={updateArticle} change={change} />
                        )}
                        {section === 'symbols' && <Symbols document={document} change={change} />}
                        {section === 'frames' && <Frames document={document} change={change} />}
                        {section === 'labour' && <Labour document={document} change={change} />}
                        {section === 'company' && <Company document={document} change={change} />}
                    </fieldset>
                </>
            )}
            <p id="pricing-status" role="status" className="aistatus">
                {status}
            </p>
        </div>
    )
}

function Articles({articles, search, setSearch, update, change}) {
    const {t} = useTranslation()
    const words = search.toLowerCase().split(/\s+/).filter(Boolean),
        shown = articles.filter((article) => words.every((word) => [article.name, article.code, article.cable, t('pricing.groups.' + article.group)].join(' ').toLowerCase().includes(word)))
    const missing = articles.filter((article) => article.price == null || article.price === '').length
    return (
        <section id="pricing-articles">
            <p className="pricinghint">{t('pricing.articlesHint')}</p>
            <div className="pricingbar">
                <input id="pricing-article-search" type="search" placeholder={t('pricing.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
                <button
                    id="pricing-add-article"
                    onClick={() => {
                        setSearch('')
                        change({articles: [...articles, {id: newArticleId(), code: '', name: t('pricing.newArticle'), group: 'other', unit: 'st', price: null, minutes: 0}]})
                    }}
                >
                    {t('pricing.addArticle')}
                </button>
                {missing > 0 && <span id="pricing-missing">{t('pricing.missingPrices', {count: missing})}</span>}
            </div>
            <div className="pricingtable">
                <table>
                    <thead>
                        <tr>
                            <th>{t('pricing.columns.code')}</th>
                            <th>{t('pricing.columns.name')}</th>
                            <th>{t('pricing.columns.group')}</th>
                            <th>{t('pricing.columns.unit')}</th>
                            <th>{t('pricing.columns.price')}</th>
                            <th>{t('pricing.columns.minutes')}</th>
                            <th>{t('pricing.columns.match')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((article) => (
                            <tr key={article.id} id={'article-' + article.id}>
                                <td>
                                    <input className="code" value={article.code || ''} aria-label={t('pricing.columns.code')} onChange={(event) => update(article.id, {code: event.target.value})} />
                                </td>
                                <td>
                                    <input className="name" value={article.name || ''} aria-label={t('pricing.columns.name')} onChange={(event) => update(article.id, {name: event.target.value})} />
                                </td>
                                <td>
                                    <select value={article.group || 'other'} aria-label={t('pricing.columns.group')} onChange={(event) => update(article.id, {group: event.target.value})}>
                                        {ARTICLE_GROUPS.map((group) => (
                                            <option key={group} value={group}>
                                                {t('pricing.groups.' + group)}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    <select value={article.unit || 'st'} aria-label={t('pricing.columns.unit')} onChange={(event) => update(article.id, {unit: event.target.value})}>
                                        <option value="st">{t('pricing.units.st')}</option>
                                        <option value="m">{t('pricing.units.m')}</option>
                                    </select>
                                </td>
                                <td>
                                    <input
                                        className="num price"
                                        inputMode="decimal"
                                        value={article.price ?? ''}
                                        placeholder="0,00"
                                        aria-label={t('pricing.columns.price')}
                                        onChange={(event) => update(article.id, {price: event.target.value === '' ? null : event.target.value})}
                                    />
                                </td>
                                <td>
                                    <input
                                        className="num"
                                        inputMode="decimal"
                                        value={article.minutes ?? ''}
                                        aria-label={t('pricing.columns.minutes')}
                                        onChange={(event) => update(article.id, {minutes: event.target.value})}
                                    />
                                </td>
                                <td>
                                    {article.group === 'cable' && (
                                        <input
                                            className="match"
                                            value={article.cable || ''}
                                            placeholder="XVB 3G2,5"
                                            aria-label={t('pricing.cableMatch')}
                                            title={t('pricing.cableMatch')}
                                            onChange={(event) => update(article.id, {cable: event.target.value})}
                                        />
                                    )}
                                    {article.group === 'protection' && (
                                        <span className="matchpair">
                                            <select
                                                value={article.protection?.kind || 'automatisch'}
                                                aria-label={t('pricing.protectionKind')}
                                                onChange={(event) => update(article.id, {protection: {...article.protection, kind: event.target.value}})}
                                            >
                                                {PROTECTION_KINDS.map((kind) => (
                                                    <option key={kind} value={kind}>
                                                        {t('materials.kinds.' + kind)}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                className="match"
                                                value={article.protection?.match || ''}
                                                placeholder="2P B16"
                                                aria-label={t('pricing.protectionMatch')}
                                                title={t('pricing.protectionMatch')}
                                                onChange={(event) => update(article.id, {protection: {kind: 'automatisch', ...article.protection, match: event.target.value}})}
                                            />
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <button
                                        className="danger"
                                        title={t('pricing.removeArticle')}
                                        aria-label={t('pricing.removeArticle')}
                                        onClick={() => change({articles: articles.filter((other) => other.id !== article.id)})}
                                    >
                                        ×
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

function Symbols({document, change}) {
    const {t} = useTranslation()
    const types = useMemo(
        () => allTypes({}).filter((type) => !NOT_A_SYMBOL.has(type.k) && type.k && (type.place !== false || type.een !== false) && !(type.wire && type.een === false)),
        [],
    )
    const nameOf = (key) => {
        const [type, waterproof] = key.split('|'),
            symbol = types.find((candidate) => candidate.k === type)
        return (symbol ? symbolName(symbol) : type) + (waterproof ? ' (' + t('materials.waterproof') + ')' : '')
    }
    const keys = Object.keys(document.symbols).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    const setRecipe = (key, recipe) => change({symbols: {...document.symbols, [key]: recipe}})
    const [adding, setAdding] = useState('')
    return (
        <section id="pricing-symbols">
            <p className="pricinghint">{t('pricing.symbolsHint')}</p>
            <div className="pricingbar">
                <select id="pricing-symbol-add" value={adding} onChange={(event) => setAdding(event.target.value)} aria-label={t('pricing.addSymbol')}>
                    <option value="">{t('pricing.chooseSymbol')}</option>
                    {types
                        .flatMap((type) => [type.k, ...(type.sock ? [type.k + '|h'] : [])])
                        .filter((key) => !document.symbols[key])
                        .map((key) => (
                            <option key={key} value={key}>
                                {nameOf(key)}
                            </option>
                        ))}
                </select>
                <button
                    id="pricing-symbol-add-button"
                    disabled={!adding}
                    onClick={() => {
                        setRecipe(adding, {places: 1, parts: []})
                        setAdding('')
                    }}
                >
                    {t('pricing.addSymbol')}
                </button>
            </div>
            <div className="pricingtable">
                <table>
                    <thead>
                        <tr>
                            <th>{t('pricing.columns.symbol')}</th>
                            <th title={t('pricing.placesHint')}>{t('pricing.columns.places')}</th>
                            <th>{t('pricing.columns.parts')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map((key) => {
                            const recipe = document.symbols[key],
                                parts = recipe.parts || []
                            return (
                                <tr key={key} id={'recipe-' + key.replace('|', '-h')}>
                                    <td>{nameOf(key)}</td>
                                    <td>
                                        <select
                                            value={recipe.places ?? 0}
                                            aria-label={t('pricing.columns.places')}
                                            onChange={(event) => setRecipe(key, {...recipe, places: Number(event.target.value)})}
                                        >
                                            {Array.from({length: MAX_FRAME_PLACES + 1}, (_, places) => (
                                                <option key={places} value={places}>
                                                    {places}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="parts">
                                        {parts.map((part, index) => (
                                            <span key={index} className="part">
                                                <input
                                                    className="num qty"
                                                    value={part.qty ?? 1}
                                                    aria-label={t('pricing.qty')}
                                                    onChange={(event) =>
                                                        setRecipe(key, {...recipe, parts: parts.map((other, at) => (at === index ? {...other, qty: event.target.value} : other))})
                                                    }
                                                />
                                                ×
                                                <ArticleSelect
                                                    articles={document.articles}
                                                    value={part.article}
                                                    label={t('pricing.columns.parts')}
                                                    onChange={(article) => setRecipe(key, {...recipe, parts: parts.map((other, at) => (at === index ? {...other, article} : other))})}
                                                />
                                                <button
                                                    className="danger"
                                                    aria-label={t('pricing.removePart')}
                                                    title={t('pricing.removePart')}
                                                    onClick={() => setRecipe(key, {...recipe, parts: parts.filter((_, at) => at !== index)})}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                        <button className="addpart" onClick={() => setRecipe(key, {...recipe, parts: [...parts, {article: '', qty: 1}]})}>
                                            {t('pricing.addPart')}
                                        </button>
                                    </td>
                                    <td>
                                        <button
                                            className="danger"
                                            aria-label={t('pricing.removeSymbol')}
                                            title={t('pricing.removeSymbol')}
                                            onClick={() => {
                                                const {[key]: _removed, ...rest} = document.symbols
                                                change({symbols: rest})
                                            }}
                                        >
                                            ×
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

function Frames({document, change}) {
    const {t} = useTranslation()
    const setFrame = (direction, places, article) => change({frames: {...document.frames, [direction]: {...document.frames[direction], [places]: article || undefined}}})
    return (
        <section id="pricing-frames">
            <p className="pricinghint">{t('pricing.framesHint')}</p>
            <table className="pricingtable framestable">
                <thead>
                    <tr>
                        <th>{t('pricing.columns.places')}</th>
                        <th>{t('situation.horizontal')}</th>
                        <th>{t('situation.vertical')}</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({length: MAX_FRAME_PLACES}, (_, index) => index + 1).map((places) => (
                        <tr key={places}>
                            <td>{places}</td>
                            {['h', 'v'].map((direction) => (
                                <td key={direction}>
                                    <ArticleSelect
                                        id={`frame-${direction}-${places}`}
                                        articles={document.articles}
                                        value={document.frames[direction]?.[places]}
                                        label={t('pricing.frameOf', {places, direction: t(direction === 'h' ? 'situation.horizontal' : 'situation.vertical')})}
                                        onChange={(article) => setFrame(direction, places, article)}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <label className="pricingrow">
                {t('pricing.box')}
                <ArticleSelect id="frame-box" articles={document.articles} value={document.frames.box} label={t('pricing.box')} onChange={(box) => change({frames: {...document.frames, box}})} />
            </label>
        </section>
    )
}

function Labour({document, change}) {
    const {t} = useTranslation()
    return (
        <section id="pricing-labour" className="pricingform">
            <label>
                {t('pricing.hourly')}
                <input id="pricing-hourly" inputMode="decimal" value={document.labour.hourly ?? ''} onChange={(event) => change({labour: {...document.labour, hourly: event.target.value === '' ? null : event.target.value}})} />
            </label>
            <label>
                {t('pricing.margin')}
                <input id="pricing-margin" inputMode="decimal" value={document.margin ?? 0} onChange={(event) => change({margin: event.target.value})} />
            </label>
            <label>
                {t('pricing.vat')}
                <select id="pricing-vat" value={document.vat} onChange={(event) => change({vat: Number(event.target.value)})}>
                    {VAT_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                            {t('quote.vatRates.' + rate)}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                {t('pricing.validDays')}
                <input id="pricing-valid" inputMode="numeric" value={document.validDays} onChange={(event) => change({validDays: event.target.value})} />
            </label>
            <p className="pricinghint">{t('pricing.labourHint')}</p>
        </section>
    )
}

function Company({document, change}) {
    const {t} = useTranslation()
    const company = document.company,
        set = (patch) => change({company: {...company, ...patch}})
    return (
        <section id="pricing-company" className="pricingform">
            {COMPANY_FIELDS.map((field) => (
                <label key={field}>
                    {t('pricing.company.' + field)}
                    <input id={'company-' + field} value={company[field] || ''} maxLength={200} onChange={(event) => set({[field]: event.target.value})} />
                </label>
            ))}
            <label>
                {t('pricing.company.logo')}
                <input
                    id="company-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={async (event) => {
                        const file = event.target.files?.[0]
                        if (file) set({logo: await logoOf(file)})
                    }}
                />
            </label>
            {company.logo && (
                <span className="logopreview">
                    <img id="company-logo-preview" src={company.logo} alt={t('pricing.company.logo')} />
                    <button id="company-logo-remove" onClick={() => set({logo: undefined})}>
                        {t('pricing.company.removeLogo')}
                    </button>
                </span>
            )}
            <label className="wide">
                {t('pricing.company.intro')}
                <textarea id="company-intro" rows={3} value={company.intro || ''} onChange={(event) => set({intro: event.target.value})} />
            </label>
            <label className="wide">
                {t('pricing.company.terms')}
                <textarea id="company-terms" rows={4} value={company.terms || ''} onChange={(event) => set({terms: event.target.value})} />
            </label>
        </section>
    )
}
