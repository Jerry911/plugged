// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// "Eendraadschema maken": what the symbols on the plans would become (model/generateOneWire.js), before anything changes. A summary on top
// (24 kringen · 8 × 16 A · 16 × 20 A · 110 symbolen), the circuits as a table with a row each (open a row for its points: B4 wissel → wissel
// → lichtpunt), where the breaker and cable of a new circuit can be changed (the cable follows the breaker unless another one was typed),
// and the symbols that are left out, grouped by kind and reason, with a button that selects them on the plan. Centred, with the title and
// the buttons fixed and only the middle scrolling, so it reads the same for 2 circuits or 40.
import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {BREAKERS, CABLE_FOR_BREAKER, CABLES, CONTROL_TYPES, planOneWire} from '../../model/generateOneWire.js'
import Icon from '../../components/Icon.jsx'

// "wissel → wissel → lichtpunt": the switches in series, then what hangs under the last one
const pointText = (project, types) => {
    const name = (type) => symbolName(typeOf(project, type)),
        switches = types.filter((type) => CONTROL_TYPES.has(type)).map(name),
        rest = types.filter((type) => !CONTROL_TYPES.has(type)).map(name)
    return [...switches, rest.join(', ')].filter(Boolean).join(' → ')
}

/** A text with a count: the key itself, or key + 'One' for exactly one ('1 kring' / '24 kringen'). */
export const counted = (t, key, count, values = {}) => t(count === 1 ? key + 'One' : key, {count, ...values})

/** The summary of a plan: '24 kringen · 8 × 16 A · 16 × 20 A · 110 symbolen' (and the existing circuits that get points). */
export const planSummary = (t, plan) => {
    const fresh = plan.circuits.filter((circuit) => !circuit.existing),
        existing = plan.circuits.length - fresh.length,
        byAmp = new Map()
    fresh.forEach((circuit) => byAmp.set(circuit.amp, (byAmp.get(circuit.amp) || 0) + 1))
    return [
        fresh.length ? counted(t, 'generate.summary.circuits', fresh.length) : null,
        ...[...byAmp.entries()].sort(([a], [b]) => a - b).map(([amp, count]) => t('generate.summary.breakers', {count, amp})),
        existing ? counted(t, 'generate.summary.existing', existing) : null,
        counted(t, 'generate.summary.symbols', plan.linked),
    ]
        .filter(Boolean)
        .join(' · ')
}

// the symbols left out, one group per kind of symbol and reason: [{type, reason, items: [{item, pageIndex}]}]
const skippedGroups = (skipped) => {
    const groups = new Map()
    skipped.forEach((entry) => {
        const key = entry.reason + ':' + entry.item.type
        if (!groups.has(key)) groups.set(key, {type: entry.item.type, reason: entry.reason, items: []})
        groups.get(key).items.push(entry)
    })
    return [...groups.values()]
}

/** onGenerate(choices): make it, with the breaker and cable chosen per new circuit ({letter: {amp, kabel}}); onShow(entries): select these
 * skipped symbols on the plan; onClose(). */
export default function GenerateOneWireDialog({project, onGenerate, onShow, onClose}) {
    const {t} = useTranslation()
    const dialog = useRef(null),
        [choices, setChoices] = useState({}),
        [open, setOpen] = useState(() => new Set())
    const plan = useMemo(() => planOneWire(project, typeOf, choices), [project, choices])
    // the dialog opens at its top (the title and the summary), with the main button ready for Enter
    useEffect(() => dialog.current?.querySelector('#generate-ok:not(:disabled), #generate-cancel')?.focus({preventScroll: true}), [])
    const fresh = plan.circuits.filter((circuit) => !circuit.existing).length,
        groups = skippedGroups(plan.skipped),
        allOpen = plan.circuits.length > 0 && plan.circuits.every((circuit) => open.has(circuit.letter)),
        pagesOf = (items) => [...new Set(items.map((entry) => entry.pageIndex))].map((index) => project.sit[index].name).join(', ')
    const toggle = (letter) =>
        setOpen((current) => {
            const next = new Set(current)
            if (next.has(letter)) next.delete(letter)
            else next.add(letter)
            return next
        })
    const choose = (letter, change) => setChoices((current) => ({...current, [letter]: {...current[letter], ...change}}))
    // a new breaker brings the cable that goes with it, unless the cable is not the one of the old breaker (typed or picked by hand)
    const chooseBreaker = (circuit, amp) =>
        choose(circuit.letter, circuit.kabel === CABLE_FOR_BREAKER[circuit.amp] && CABLE_FOR_BREAKER[amp] ? {amp, kabel: CABLE_FOR_BREAKER[amp]} : {amp})
    return (
        <>
            <div className="genback ui" aria-hidden="true" onClick={onClose} />
            <div
                id="generate-dialog"
                ref={dialog}
                className="dlg ui generatedlg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="generate-title"
                onKeyDown={(event) => event.key === 'Escape' && onClose()}
            >
                <header className="genhead">
                    <div className="genheadrow">
                        <h2 id="generate-title">{t('generate.title')}</h2>
                        <button id="generate-close" className="sheetInfoBtn" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>
                            <Icon name="close" />
                        </button>
                    </div>
                    <p className="genintro">{t('generate.intro')}</p>
                    {(plan.circuits.length > 0 || plan.skipped.length > 0) && (
                        <p id="generate-summary" className="gensummary">
                            {plan.circuits.length > 0 && planSummary(t, plan)}
                            {plan.circuits.length > 0 && plan.skipped.length > 0 && ' · '}
                            {plan.skipped.length > 0 && <span className="genwarn">{t('generate.summary.skipped', {count: plan.skipped.length})}</span>}
                        </p>
                    )}
                </header>
                <div className="genbody">
                    {plan.circuits.length ? (
                        <section aria-labelledby="generate-circuits-title">
                            <div className="gentabletop">
                                <h3 id="generate-circuits-title">{t('generate.circuitsTitle')}</h3>
                                <button
                                    id="generate-expand"
                                    type="button"
                                    onClick={() => setOpen(allOpen ? new Set() : new Set(plan.circuits.map((circuit) => circuit.letter)))}
                                >
                                    <Icon name={allOpen ? 'chevronDown' : 'chevronRight'} /> {allOpen ? t('generate.collapseAll') : t('generate.expandAll')}
                                </button>
                            </div>
                            <p className="genhint">{t('generate.changeHint')}</p>
                            <datalist id="generate-cables">
                                {CABLES.map((cable) => (
                                    <option key={cable} value={cable} />
                                ))}
                            </datalist>
                            <div className="gentable" role="list">
                                <div className="genrow genheader" aria-hidden="true">
                                    <span />
                                    <span>{t('generate.columns.circuit')}</span>
                                    <span>{t('generate.columns.state')}</span>
                                    <span>{t('generate.columns.breaker')}</span>
                                    <span>{t('generate.columns.cable')}</span>
                                    <span className="num">{t('generate.columns.points')}</span>
                                </div>
                                <div id="generate-circuits">
                                    {plan.circuits.map((circuit) => {
                                        const letter = circuit.letter,
                                            shown = open.has(letter),
                                            typed = choices[letter]?.kabel
                                        return (
                                            <div key={letter} id={'generate-circuit-' + letter} className={'genitem' + (shown ? ' open' : '')} role="listitem">
                                                <div className="genrow">
                                                    <button
                                                        type="button"
                                                        id={'generate-toggle-' + letter}
                                                        className="gentoggle"
                                                        aria-expanded={shown}
                                                        aria-controls={'generate-points-' + letter}
                                                        aria-label={t('generate.pointsOf', {letter})}
                                                        onClick={() => toggle(letter)}
                                                    >
                                                        <Icon name="chevronRight" className="genchevron" />
                                                    </button>
                                                    <b className="genletter">{letter}</b>
                                                    <span className={'genstate ' + (circuit.existing ? 'existing' : 'new')}>
                                                        {circuit.existing ? t('generate.state.existing') : t('generate.state.new')}
                                                    </span>
                                                    {circuit.existing ? (
                                                        <span>–</span>
                                                    ) : (
                                                        <select
                                                            id={'generate-amp-' + letter}
                                                            aria-label={t('generate.breakerOf', {letter})}
                                                            value={circuit.amp}
                                                            onChange={(event) => chooseBreaker(circuit, +event.target.value)}
                                                        >
                                                            {(BREAKERS.includes(circuit.amp) ? BREAKERS : [...BREAKERS, circuit.amp].sort((a, b) => a - b)).map(
                                                                (amp) => (
                                                                    <option key={amp} value={amp}>
                                                                        {t('generate.breaker', {amp})}
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                    )}
                                                    {circuit.existing ? (
                                                        <span>–</span>
                                                    ) : (
                                                        <input
                                                            id={'generate-cable-' + letter}
                                                            list="generate-cables"
                                                            aria-label={t('generate.cableOf', {letter})}
                                                            value={typed ?? circuit.kabel}
                                                            placeholder={circuit.kabel}
                                                            onChange={(event) => choose(letter, {kabel: event.target.value})}
                                                        />
                                                    )}
                                                    <span className="num">{counted(t, 'generate.points', circuit.points.length)}</span>
                                                </div>
                                                {shown && (
                                                    <ul id={'generate-points-' + letter} className="genpoints">
                                                        {circuit.points.map((point) => (
                                                            <li key={point.number}>
                                                                <span className="genmark">
                                                                    {letter}
                                                                    {point.number}
                                                                </span>
                                                                <span>{pointText(project, point.types)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </section>
                    ) : (
                        <p id="generate-nothing" className="dimerr">
                            {t('generate.nothing')}
                        </p>
                    )}
                    {groups.length > 0 && (
                        <section id="generate-skipped" className="genskipped" aria-labelledby="generate-skipped-title">
                            <h3 id="generate-skipped-title">
                                <Icon name="warning" /> {t('generate.skippedTitle', {count: plan.skipped.length})}
                            </h3>
                            <ul>
                                {groups.map((group, index) => (
                                    <li key={group.reason + group.type} id={'generate-skip-' + index}>
                                        <span className="genskipwhat">
                                            <b>{t('generate.skippedGroup', {count: group.items.length, name: symbolName(typeOf(project, group.type))})}</b>{' '}
                                            <span className="genskipwhy">
                                                {t('generate.reasons.' + group.reason)}
                                                {project.sit.length > 1 ? ' · ' + pagesOf(group.items) : ''}
                                            </span>
                                        </span>
                                        <button type="button" id={'generate-show-' + index} onClick={() => onShow(group.items)}>
                                            <Icon name="search" /> {t('generate.show')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
                <footer className="genfoot">
                    <button id="generate-cancel" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button id="generate-ok" className="primary" disabled={!plan.circuits.length} onClick={() => onGenerate(choices)}>
                        <Icon name="check" /> {fresh ? counted(t, 'generate.ok', fresh) : t('generate.okPoints')}
                    </button>
                </footer>
            </div>
        </>
    )
}
