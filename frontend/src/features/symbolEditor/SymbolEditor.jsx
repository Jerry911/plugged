// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Componenten tab: menu with all symbols on the left, the selected symbol (name, category, allowed parents, drawing) on the right.
// The symbols come from the backend: standard ones (can be edited, deleted and restored to the standard drawing) and the user's own ones.
import {useEffect, useState} from 'react'
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {categoryName, OWN_CATEGORY, symbolName} from '../../symbols/symbolLibrary.js'
import {newId} from '../../model/tree.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {toDomId} from '../../components/domId.js'

const DRAWING_TOOLS = ['line', 'circle', 'rect', 'arc', 'text']
const GRID_SIZES = [0.5, 1, 2, 4]
const PREVIEW_SIZES = [20, 32, 46]

// a copy that can be edited without changing the symbol in the library
const editableCopy = (symbol) => ({...symbol, parents: [...symbol.parents], shapes: [...symbol.shapes]})

// where a symbol comes from, for the label above the drawing
const originKey = (symbol) => (symbol.builtin ? (symbol.modified ? 'symbolEditor.origin.modified' : 'symbolEditor.origin.standard') : 'symbolEditor.origin.own')

/**
 * library = all symbols; the handlers call the backend (see api/useSymbolLibrary.js): onSave(symbol), onRemove(key), onRestore(key),
 * onRestoreAll(), onMakeStandard(key) and onTemplate() (a new, empty symbol of the user).
 */
export default function SymbolEditor({library, onSave, onRemove, onRestore, onRestoreAll, onMakeStandard, onTemplate}) {
    const {t} = useTranslation()
    const [draft, setDraft] = useState(null),
        [original, setOriginal] = useState(null),
        [search, setSearch] = useState(''),
        [tool, setTool] = useState('line'),
        [gridSize, setGridSize] = useState(1),
        // the first click of the shape being drawn
        [anchor, setAnchor] = useState(null),
        [hover, setHover] = useState(null),
        [message, setMessage] = useState('')
    const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(original),
        isStandard = !!draft?.builtin,
        isStored = library.some((symbol) => draft && symbol.k === draft.k)
    // The name field shows the name in the active language; a standard name that was not changed is stored as it was (in Dutch), so it keeps
    // being translated.
    const shownName = (symbol) => (symbol ? symbolName(symbol) : '')
    const open = (symbol, isNew = false) => {
        if (dirty && !window.confirm(t('symbolEditor.confirmDiscard'))) return
        const copy = editableCopy(symbol)
        setDraft({...copy, name: shownName(copy)})
        setOriginal(isNew ? null : {...copy, name: shownName(copy)})
        setAnchor(null)
        setMessage('')
    }
    const change = (patch) => {
        setDraft({...draft, ...patch})
        setMessage('')
    }
    const snap = (value) => Math.round(Math.round(value / gridSize) * gridSize * 100) / 100
    // mouse position on the drawing, snapped to the grid
    const gridPointOf = (event) => {
        const svg = event.currentTarget,
            point = svg.createSVGPoint()
        point.x = event.clientX
        point.y = event.clientY
        const local = point.matrixTransform(svg.getScreenCTM().inverse())
        return {x: snap(local.x), y: snap(local.y)}
    }
    // the shape of the active tool from the first click (anchor) to the point (x, y): used for the preview and for the final shape
    const shapeTo = (x, y) => {
        const radius = Math.max(gridSize, snap(Math.hypot(x - anchor.x, y - anchor.y))),
            angle = Math.round((Math.atan2(y - anchor.y, x - anchor.x) * 180) / Math.PI)
        switch (tool) {
            case 'line':
                return {t: 'line', x1: anchor.x, y1: anchor.y, x2: x, y2: y}
            case 'circle':
                return {t: 'circle', cx: anchor.x, cy: anchor.y, r: radius}
            case 'arc':
                return {t: 'arc', cx: anchor.x, cy: anchor.y, r: radius, a1: angle - 90, a2: angle + 90}
            default:
                return {t: 'rect', x: Math.min(anchor.x, x), y: Math.min(anchor.y, y), w: Math.abs(x - anchor.x) || gridSize, h: Math.abs(y - anchor.y) || gridSize}
        }
    }
    const onDrawingClick = (event) => {
        const {x, y} = gridPointOf(event)
        if (tool === 'text') {
            const text = prompt(t('symbolEditor.textPrompt'))
            if (text) change({shapes: [...draft.shapes, {t: 'text', x, y, s: text}]})
            return
        }
        if (!anchor) return setAnchor({x, y}) // first click: the shape follows the mouse
        change({shapes: [...draft.shapes, shapeTo(x, y)]}) // second click: finalize it on the grid
        setAnchor(null)
    }
    const onDrawingMove = (event) => {
        const point = gridPointOf(event)
        setHover((current) => (current && current.x === point.x && current.y === point.y ? current : point))
    }
    // Escape cancels the shape that is being drawn
    useEffect(() => {
        const onKeyDown = (event) => event.key === 'Escape' && setAnchor(null)
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    }, [])
    const createNew = async () => {
        const template = await onTemplate()
        if (!template) return alert(t('symbolEditor.newNotPossible'))
        open(template, true)
    }
    // the draft as it is sent to the backend: an unchanged translated standard name goes back as the stored name
    const toStore = () => {
        const stored = library.find((symbol) => symbol.k === draft.k),
            name = draft.name.trim(),
            keepsStoredName = stored && name === shownName(stored)
        return {...draft, name: keepsStoredName ? stored.name : name, cat: draft.cat.trim() || OWN_CATEGORY}
    }
    // saves the draft; resolves to the symbol the backend answered with (null when it was not valid or not accepted)
    const store = async () => {
        if (!draft.name.trim() || !draft.shapes.length) {
            alert(t('symbolEditor.nameAndShapeRequired'))
            return null
        }
        const saved = await onSave(toStore())
        if (!saved) setMessage(t('symbolEditor.notSaved'))
        return saved
    }
    const showSaved = (symbol, messageKey) => {
        const copy = {...editableCopy(symbol), name: shownName(symbol)}
        setDraft(copy)
        setOriginal(copy)
        setMessage(t(messageKey))
    }
    const save = async () => {
        const saved = await store()
        if (saved) showSaved(saved, 'symbolEditor.saved')
    }
    // the current drawing of a standard symbol becomes its new standard (what "Standaard herstellen" goes back to)
    const makeStandard = async () => {
        if (!window.confirm(t('symbolEditor.confirmMakeStandard', {name: draft.name}))) return
        if (dirty && !(await store())) return
        const updated = await onMakeStandard(draft.k)
        if (!updated) return setMessage(t('symbolEditor.notMadeStandard'))
        showSaved(updated, 'symbolEditor.madeStandard')
    }
    const remove = async () => {
        const standardNote = draft.builtin ? ' ' + t('symbolEditor.deleteStandardNote') : ''
        if (!window.confirm(t('symbolEditor.confirmDelete', {name: draft.name}) + standardNote)) return
        await onRemove(draft.k)
        setDraft(null)
        setOriginal(null)
    }
    const restore = async () => {
        const restored = await onRestore(draft.k)
        if (!restored) return setMessage(t('symbolEditor.notRestored'))
        showSaved(restored, 'symbolEditor.restored')
    }
    const restoreAll = async () => {
        if (!window.confirm(t('symbolEditor.confirmRestoreAll'))) return
        if (!(await onRestoreAll())) return setMessage(t('symbolEditor.notRestored'))
        setDraft(null)
        setOriginal(null)
        setMessage(t('symbolEditor.allRestored'))
    }
    const duplicate = () =>
        open({...draft, k: 'custom:' + newId(), name: t('common.copyOf', {name: draft.name}), builtin: false, modified: false, v: 0}, true)
    const categories = [...new Set(library.map((symbol) => symbol.cat))],
        searchText = search.toLowerCase()
    return (
        <div className="row comp">
            <div className="side ui pal" id="comp-menu">
                <input
                    id="comp-search"
                    placeholder={t('symbolEditor.search')}
                    aria-label={t('symbolEditor.search')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    style={{width: '100%', boxSizing: 'border-box'}}
                />
                <button id="comp-new" onClick={createNew}>
                    ＋ {t('symbolEditor.newComponent')}
                </button>
                <button id="comp-restore-all" title={t('symbolEditor.restoreAllTitle')} onClick={restoreAll}>
                    {t('symbolEditor.restoreAll')}
                </button>
                <div className="complist">
                    {categories.map((category) => {
                        const matching = library.filter((symbol) => symbol.cat === category && symbolName(symbol).toLowerCase().includes(searchText))
                        return (
                            matching.length > 0 && (
                                <details
                                    key={category}
                                    id={'comp-category-' + toDomId(category)}
                                    open={!!search || (draft ? draft.cat === category : category === categories[0])}
                                >
                                    <summary>
                                        <b>{categoryName(category)}</b>
                                    </summary>
                                    {matching.map((symbol) => (
                                        <button
                                            key={symbol.k}
                                            id={'comp-item-' + toDomId(symbol.k)}
                                            className={draft?.k === symbol.k ? 'on' : ''}
                                            onClick={() => open(symbol)}
                                        >
                                            <svg width="26" height="26" viewBox="0 0 26 26">
                                                <SymbolGraphic shapes={symbol.shapes} x={13} y={13} size={24} />
                                            </svg>
                                            {symbolName(symbol)}
                                            {symbol.builtin && symbol.modified ? ' ✎' : ''}
                                        </button>
                                    ))}
                                </details>
                            )
                        )
                    })}
                </div>
            </div>
            <div className="main">
                {!draft ? (
                    <>
                        <p id="comp-intro">{t('symbolEditor.intro')}</p>
                        {message && <p id="comp-message">{message}</p>}
                    </>
                ) : (
                    <>
                        <p id="comp-hint" className="chint">{t('symbolEditor.drawingHint')}</p>
                        <div className="tb cgroup cactions">
                            <button id="comp-save" className="accent" onClick={save}>
                                {isStored ? t('common.save') : t('symbolEditor.add')}
                            </button>
                            <button id="comp-duplicate" onClick={duplicate}>
                                {t('symbolEditor.duplicate')}
                            </button>
                            <button id="comp-undo-shape" title={t('symbolEditor.undoShape')} onClick={() => change({shapes: draft.shapes.slice(0, -1)})}>
                                ↶
                            </button>
                            <button id="comp-clear" onClick={() => change({shapes: []})}>
                                {t('symbolEditor.clear')}
                            </button>
                            {dirty && <span id="comp-dirty">● {t('symbolEditor.unsaved')}</span>}
                            {message && <span id="comp-message">{message}</span>}
                            <small id="comp-origin" style={{marginLeft: 'auto'}}>
                                {t(originKey(draft))}
                            </small>
                        </div>
                        <div className="cwork">
                            <div className="ctools">
                                <div className="cgroup">
                                    <b>{t('symbolEditor.draw')}</b>
                                    {DRAWING_TOOLS.map((name) => (
                                        <button
                                            key={name}
                                            id={'comp-tool-' + name}
                                            className={tool === name ? 'on' : ''}
                                            onClick={() => {
                                                setTool(name)
                                                setAnchor(null)
                                            }}
                                        >
                                            {t('symbolEditor.tools.' + name)}
                                        </button>
                                    ))}
                                </div>
                                {(isStandard || isStored) && (
                                    <div className="cgroup">
                                        <b>{t('symbolEditor.component')}</b>
                                        {isStandard && (
                                            <>
                                                <button id="comp-restore" disabled={!draft.modified && !dirty} onClick={restore}>
                                                    {t('symbolEditor.restore')}
                                                </button>
                                                <button
                                                    id="comp-make-standard"
                                                    className="danger cdanger"
                                                    disabled={!draft.modified && !dirty}
                                                    title={t('symbolEditor.makeStandardTitle')}
                                                    onClick={makeStandard}
                                                >
                                                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                                                        <path d="M8 1.5 1 14h14z" />
                                                        <path d="M8 6v3.5M8 11.5v.01" />
                                                    </svg>
                                                    {t('symbolEditor.makeStandard')}
                                                </button>
                                            </>
                                        )}
                                        {isStored && (
                                            <button id="comp-delete" className="danger" onClick={remove}>
                                                {t('symbolEditor.delete')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="cdraw">
                                <svg id="comp-drawing" viewBox="0 0 24 24" onClick={onDrawingClick} onMouseMove={onDrawingMove} onMouseLeave={() => setHover(null)}>
                                    <defs>
                                        <pattern id="cgrid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                                            <path d={`M${gridSize} 0H0V${gridSize}`} fill="none" stroke="#bbb" strokeWidth=".04" />
                                        </pattern>
                                        <pattern id="cgridmajor" width="6" height="6" patternUnits="userSpaceOnUse">
                                            <path d="M6 0H0V6" fill="none" stroke="#888" strokeWidth=".07" />
                                        </pattern>
                                    </defs>
                                    <rect x="0" y="0" width="24" height="24" fill="url(#cgrid)" />
                                    <rect x="0" y="0" width="24" height="24" fill="url(#cgridmajor)" />
                                    <line x1="0" y1="12" x2="24" y2="12" stroke="#f9b" strokeWidth=".1" />
                                    <SymbolGraphic shapes={draft.shapes} x={12} y={12} size={24} strokeWidth={0.6} />
                                    {anchor && hover && tool !== 'text' && (
                                        <g id="comp-shape-preview" opacity=".75" strokeDasharray=".6 .4" pointerEvents="none">
                                            <SymbolGraphic shapes={[shapeTo(hover.x, hover.y)]} x={12} y={12} size={24} strokeWidth={0.5} stroke="#0a6cff" />
                                        </g>
                                    )}
                                    {hover && <circle id="comp-hover-point" cx={hover.x} cy={hover.y} r=".25" fill="#0a6cff" pointerEvents="none" />}
                                    {anchor && <circle id="comp-anchor" cx={anchor.x} cy={anchor.y} r=".4" fill="red" />}
                                </svg>
                                <div className="ui gridsel">
                                    <label>
                                        {t('symbolEditor.grid')}{' '}
                                        <select id="comp-grid" value={gridSize} onChange={(event) => setGridSize(+event.target.value)}>
                                            {GRID_SIZES.map((size) => (
                                                <option key={size} value={size}>
                                                    {size}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </div>
                            <div className="cinfo">
                                <b>{t('symbolEditor.preview')}</b>
                                <div id="comp-previews" style={{display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0'}}>
                                    {PREVIEW_SIZES.map((size) => (
                                        <svg key={size} width={size + 4} height={size + 4} viewBox={`0 0 ${size + 4} ${size + 4}`}>
                                            <SymbolGraphic shapes={draft.shapes} x={(size + 4) / 2} y={(size + 4) / 2} size={size} />
                                        </svg>
                                    ))}
                                </div>
                                <div className="cfields">
                                    <label>
                                        {t('symbolEditor.name')}
                                        <input
                                            id="comp-name"
                                            placeholder={t('symbolEditor.namePlaceholder')}
                                            value={draft.name}
                                            onChange={(event) => change({name: event.target.value})}
                                        />
                                    </label>
                                    <label>
                                        {t('symbolEditor.category')}
                                        <input
                                            id="comp-category"
                                            placeholder={t('symbolEditor.category')}
                                            list="comp-cats"
                                            value={draft.cat}
                                            onChange={(event) => change({cat: event.target.value})}
                                        />
                                    </label>
                                    <datalist id="comp-cats">
                                        {categories.map((category) => (
                                            <option key={category} value={category} />
                                        ))}
                                    </datalist>
                                </div>
                                <label style={{display: 'block', margin: '8px 0'}}>
                                    <input id="comp-placeable" type="checkbox" checked={draft.place} onChange={(event) => change({place: event.target.checked})} />{' '}
                                    {t('symbolEditor.placeable')}
                                </label>
                                <label style={{display: 'block', margin: '8px 0'}}>
                                    <input
                                        id="comp-details"
                                        type="checkbox"
                                        checked={!!draft.details}
                                        onChange={(event) => change({details: event.target.checked})}
                                    />{' '}
                                    {t('symbolEditor.extendedDetails')}
                                </label>
                                <details id="comp-parents">
                                    <summary>
                                        <b>{t('symbolEditor.parents', {count: draft.parents.length})}</b>
                                    </summary>
                                    <div className="tb">
                                        <button id="comp-parents-all" onClick={() => change({parents: library.map((symbol) => symbol.k)})}>
                                            {t('symbolEditor.all')}
                                        </button>
                                        <button id="comp-parents-none" onClick={() => change({parents: []})}>
                                            {t('symbolEditor.none')}
                                        </button>
                                    </div>
                                    <div style={{maxHeight: 200, overflow: 'auto'}}>
                                        {library.map((symbol) => (
                                            <label key={symbol.k} style={{display: 'block'}}>
                                                <input
                                                    id={'comp-parent-' + toDomId(symbol.k)}
                                                    type="checkbox"
                                                    checked={draft.parents.includes(symbol.k)}
                                                    onChange={(event) =>
                                                        change({
                                                            parents: event.target.checked
                                                                ? [...draft.parents, symbol.k]
                                                                : draft.parents.filter((key) => key !== symbol.k),
                                                        })
                                                    }
                                                />{' '}
                                                {symbolName(symbol)}
                                            </label>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
