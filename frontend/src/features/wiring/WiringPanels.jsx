// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The panels of the bedradingsschema: the line style of a wire or rectangle (style, colour, width) and the dialog that copies a plan of the
// situatieschema onto the page.
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {colourOf, dashArray, EARTH_YELLOW, WIRE_COLOURS, WIRE_STYLES, WIRE_WIDTHS} from '../../model/wiring.js'
import {circuitMarks, placeableNodes} from '../../model/project.js'
import {newId} from '../../model/tree.js'
import Icon from '../../components/Icon.jsx'

/** A small sample of a line style for the style buttons. */
const StyleSample = ({style, color = 'black'}) => (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
        <line
            x1="2"
            y1="5"
            x2="32"
            y2="5"
            stroke={colourOf(color)}
            strokeWidth="1.6"
            strokeDasharray={dashArray(style, 1.6 * 0.35)}
            strokeLinecap={style === 'dotted' ? 'round' : 'butt'}
        />
    </svg>
)

/**
 * The fields of a line style: value = {style, color, w, ortho}; onChange(patch). idPrefix starts the ids (e.g. wire-pen or wire-sel);
 * withOrtho shows the "right angles" checkbox (wires only).
 */
export function LineStyleFields({value, onChange, idPrefix, withOrtho}) {
    const {t} = useTranslation()
    return (
        <div className="linestyle">
            <div className="tb linestyle-styles" role="group" aria-label={t('wiring.style')}>
                {WIRE_STYLES.map((style) => (
                    <button
                        key={style}
                        type="button"
                        id={`${idPrefix}-style-${style}`}
                        className={value.style === style ? 'on' : ''}
                        aria-pressed={value.style === style}
                        title={t('wiring.styles.' + style)}
                        aria-label={t('wiring.styles.' + style)}
                        onClick={() => onChange({style})}
                    >
                        <StyleSample style={style} color={value.color} />
                    </button>
                ))}
            </div>
            <div className="linestyle-colours" role="group" aria-label={t('wiring.colour')}>
                {Object.keys(WIRE_COLOURS).map((color) => (
                    <button
                        key={color}
                        type="button"
                        id={`${idPrefix}-color-${color}`}
                        className={'swatch' + (value.color === color ? ' on' : '')}
                        aria-pressed={value.color === color}
                        title={t('wiring.colours.' + color)}
                        aria-label={t('wiring.colours.' + color)}
                        style={{
                            background:
                                color === 'yellowgreen'
                                    ? `repeating-linear-gradient(135deg, ${WIRE_COLOURS.yellowgreen} 0 5px, ${EARTH_YELLOW} 5px 10px)`
                                    : colourOf(color),
                        }}
                        onClick={() => onChange({color})}
                    />
                ))}
            </div>
            <label>
                {t('wiring.width')}{' '}
                <select id={`${idPrefix}-width`} value={value.w} onChange={(event) => onChange({w: +event.target.value})}>
                    {WIRE_WIDTHS.map((width) => (
                        <option key={width} value={width}>
                            {String(width).replace('.', t('wiring.decimal'))} mm
                        </option>
                    ))}
                </select>
            </label>
            {withOrtho && (
                <label style={{display: 'block'}}>
                    <input id={`${idPrefix}-ortho`} type="checkbox" checked={!!value.ortho} onChange={(event) => onChange({ortho: event.target.checked})} />{' '}
                    {t('wiring.ortho')}
                </label>
            )}
        </div>
    )
}

/**
 * A copy of the drawing of a situatieschema page for the bedradingsschema: walls, doors, windows and texts, and (withSymbols) its symbols as
 * loose symbols with the marking they have there (A7). New ids, nothing points to the situatieschema afterwards.
 */
export const copyPlan = (project, sitPage, withSymbols) => {
    const nodes = placeableNodes(project),
        marks = circuitMarks(project)
    const items = sitPage.items.flatMap((item) => {
        if (item.kind !== 'sym') return [{...item, id: newId()}]
        if (!withSymbols) return []
        if (!item.node) return [{...item, id: newId()}]
        const node = nodes.find((candidate) => candidate.id === item.node)
        if (!node) return []
        const {node: _node, ...rest} = item
        return [{...rest, id: newId(), type: node.type, mark: item.mark ?? marks.get(node.id) ?? '', ...(node.p?.h ? {h: true} : {})}]
    })
    return {walls: sitPage.walls.map((wall) => ({...wall, id: newId()})), items}
}

/** The dialog "Plattegrond overnemen": choose a page of the situatieschema; onCopy(sitPageIndex, withSymbols), onClose(). */
export function CopyPlanDialog({project, onCopy, onClose}) {
    const {t} = useTranslation()
    const pages = project.sit,
        firstDrawn = Math.max(
            0,
            pages.findIndex((page) => page.walls.length || page.items.length),
        ),
        [pageIndex, setPageIndex] = useState(firstDrawn),
        [withSymbols, setWithSymbols] = useState(true),
        dialog = useRef(null)
    useEffect(() => dialog.current?.querySelector('select')?.focus(), [])
    const page = pages[pageIndex],
        empty = !page.walls.length && !page.items.length
    return (
        <div
            id="copy-plan-dialog"
            ref={dialog}
            className="dlg ui copyplandlg"
            role="dialog"
            aria-label={t('wiring.copyPlan.title')}
            onKeyDown={(event) => event.key === 'Escape' && onClose()}
        >
            <div className="tb">
                <b>{t('wiring.copyPlan.title')}</b>
                <button id="copy-plan-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                    <Icon name="close" />
                </button>
            </div>
            <p>{t('wiring.copyPlan.intro')}</p>
            <label style={{display: 'block', margin: '6px 0'}}>
                {t('wiring.copyPlan.page')}{' '}
                <select id="copy-plan-page" value={pageIndex} onChange={(event) => setPageIndex(+event.target.value)}>
                    {pages.map((candidate, index) => (
                        <option key={candidate.id} value={index}>
                            {candidate.name}
                        </option>
                    ))}
                </select>
            </label>
            <label style={{display: 'block', margin: '6px 0'}}>
                <input id="copy-plan-symbols" type="checkbox" checked={withSymbols} onChange={(event) => setWithSymbols(event.target.checked)} />{' '}
                {t('wiring.copyPlan.withSymbols')}
            </label>
            {empty && (
                <p id="copy-plan-empty" className="dimerr">
                    {t('wiring.copyPlan.emptyPage')}
                </p>
            )}
            <div className="tb" style={{justifyContent: 'flex-end'}}>
                <button id="copy-plan-cancel" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                <button id="copy-plan-ok" className="accent" disabled={empty} onClick={() => onCopy(pageIndex, withSymbols)}>
                    {t('wiring.copyPlan.ok')}
                </button>
            </div>
        </div>
    )
}
