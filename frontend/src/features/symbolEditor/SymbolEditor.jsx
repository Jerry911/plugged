// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Componenten tab: menu with all symbols on the left, the selected symbol (name, category, allowed parents, drawing) on the right.
// The symbols come from the backend: standard ones (can be edited, deleted and restored to the standard drawing) and the user's own ones.
import {useEffect, useRef, useState} from 'react'
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {shapesInBox, unionBounds} from '../../symbols/shapeHit.js'
import {shapeAnchor, translateShape} from '../../symbols/shapeEdit.js'
import {categoryName, OWN_CATEGORY, symbolName} from '../../symbols/symbolLibrary.js'
import {newId} from '../../model/tree.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {toDomId} from '../../components/domId.js'
import {useFillHeight} from '../../hooks/useFillHeight.js'

const DRAWING_TOOLS = ['select', 'line', 'circle', 'rect', 'arc', 'text']
// width (in grid units) of the invisible outline that makes a thin line easy to click when selecting
// the colour of the selection, as on the situatieschema
const SELECTION_COLOUR = '#0a6cff'
const HIT_WIDTH = 1.4
// a drag shorter than this (grid units) is a click, not a selection box
const MIN_DRAG = 0.3
const GRID_SIZES = [0.5, 1, 2, 4]
const PREVIEW_SIZES = [20, 32, 46]

// a copy that can be edited without changing the symbol in the library
const editableCopy = (symbol) => ({...symbol, parents: [...symbol.parents], shapes: [...symbol.shapes]})

// where a symbol comes from, for the label above the drawing
const originKey = (symbol) =>
    symbol.builtin
        ? symbol.modified
            ? 'symbolEditor.origin.modified'
            : 'symbolEditor.origin.standard'
        : symbol.group != null
          ? 'symbolEditor.origin.group'
          : 'symbolEditor.origin.own'

/**
 * library = the symbols of the user (the standard ones, his own and those of his groups); the handlers call the backend (see
 * api/useSymbolLibrary.js): onSave(symbol), onRemove(key), onRestore(key), onRestoreAll(), onMakeStandard(key) and onTemplate() (a new,
 * empty symbol of the user). groups = the groups the user can put a symbol in ([{id, name}]); onOpen() is called when the editor opens
 * (it loads the groups again: they may have changed under Beheer).
 * A symbol the backend marks as not editable (a standard symbol for somebody who is no administrator, a group symbol for a student) is shown
 * read-only: it can only be duplicated into an own symbol.
 */
export default function SymbolEditor({library, groups = [], onOpen, onSave, onRemove, onRestore, onRestoreAll, onMakeStandard, onTemplate}) {
    const {t} = useTranslation()
    const [draft, setDraft] = useState(null),
        [original, setOriginal] = useState(null),
        [search, setSearch] = useState(''),
        [tool, setTool] = useState('line'),
        [gridSize, setGridSize] = useState(1),
        // the first click of the shape being drawn
        [anchor, setAnchor] = useState(null),
        // select tool: the indexes (in draft.shapes) of the selected shapes, and the one under the mouse
        [selected, setSelected] = useState([]),
        [hovered, setHovered] = useState(null),
        // the selection box that is being dragged: {from: {x, y}, to: {x, y}, add} in grid units (not snapped)
        [box, setBox] = useState(null),
        [moving, setMoving] = useState(false),
        [hover, setHover] = useState(null),
        [message, setMessage] = useState('')
    const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(original),
        readOnly = draft?.editable === false,
        // the standard symbols are changed by administrators only: the backend says so with `editable`
        mayChangeStandard = library.some((symbol) => symbol.builtin && symbol.editable !== false),
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
        setSelected([])
        setMessage('')
    }
    const change = (patch) => {
        if (readOnly) return
        if (patch.shapes) setSelected([]) // the indexes of the selection no longer point at the same shapes
        setDraft({...draft, ...patch})
        setMessage('')
    }
    const menu = useRef(null),
        svgRef = useRef(null),
        boxRef = useRef(null),
        // the shapes that are being dragged: {start (grid units, not snapped), grab (the anchor of the shape that was grabbed), originals (draft.shapes before the drag), moved}
        moveRef = useRef(null),
        // the click that ends a drag must not select or deselect anything
        afterDrag = useRef(false)
    const snap = (value) => Math.round(Math.round(value / gridSize) * gridSize * 100) / 100
    // mouse position on the drawing, snapped to the grid
    const localPointOf = (svg, clientX, clientY) => {
        const point = svg.createSVGPoint()
        point.x = clientX
        point.y = clientY
        return point.matrixTransform(svg.getScreenCTM().inverse())
    }
    const gridPointOf = (event) => {
        const local = localPointOf(event.currentTarget, event.clientX, event.clientY)
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
    // select tool: a click on a shape selects it (shift = add to / remove from the selection), a click next to the shapes clears the selection
    // pressing a shape: shift adds it to / removes it from the selection, a shape of the selection is dragged together with the rest of the
    // selection, any other shape becomes the selection and can be dragged straight away
    const pressShape = (event, index) => {
        if (event.button !== 0 || readOnly) return
        event.stopPropagation()
        if (event.shiftKey) return setSelected((current) => (current.includes(index) ? current.filter((i) => i !== index) : [...current, index]))
        const local = localPointOf(svgRef.current, event.clientX, event.clientY)
        if (!selected.includes(index)) setSelected([index])
        moveRef.current = {
            start: {x: local.x, y: local.y},
            grab: shapeAnchor(draft.shapes[index]),
            originals: draft.shapes,
            selection: selected.includes(index) ? selected : [index],
            moved: false,
        }
        setMoving(true)
    }
    const deleteSelected = () => {
        if (!selected.length) return
        change({shapes: draft.shapes.filter((_, index) => !selected.includes(index))})
        setHovered(null)
    }
    const onDrawingClick = (event) => {
        if (readOnly) return
        if (tool === 'select') return afterDrag.current ? undefined : setSelected([])
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
    // select tool: dragging on empty space draws a selection box (shapes inside it or touching it)
    const onDrawingDown = (event) => {
        if (readOnly || tool !== 'select' || event.button !== 0) return
        const local = localPointOf(event.currentTarget, event.clientX, event.clientY),
            start = {x: local.x, y: local.y}
        boxRef.current = {from: start, to: start, add: event.shiftKey}
        setBox(boxRef.current)
    }
    const dragging = !!box || moving
    // the groups may have changed under Beheer since the app opened
    useEffect(() => {
        onOpen?.()
    }, [onOpen])
    useEffect(() => {
        if (!dragging) return
        const pointOf = (event) => localPointOf(svgRef.current, event.clientX, event.clientY)
        const onMove = (event) => {
            if (!svgRef.current) return
            const local = pointOf(event)
            if (boxRef.current) {
                boxRef.current = {...boxRef.current, to: {x: local.x, y: local.y}}
                return setBox(boxRef.current)
            }
            const drag = moveRef.current
            if (!drag) return
            if (!drag.moved && Math.hypot(local.x - drag.start.x, local.y - drag.start.y) < MIN_DRAG) return
            drag.moved = true
            // the grabbed shape follows the grid, the others of the selection move along by the same distance
            const dx = snap(drag.grab.x + local.x - drag.start.x) - drag.grab.x,
                dy = snap(drag.grab.y + local.y - drag.start.y) - drag.grab.y
            setDraft((current) => ({...current, shapes: drag.originals.map((shape, index) => (drag.selection.includes(index) ? translateShape(shape, dx, dy) : shape))}))
        }
        const onUp = () => {
            const finishedBox = boxRef.current,
                drag = moveRef.current
            boxRef.current = null
            moveRef.current = null
            setBox(null)
            setMoving(false)
            if (drag?.moved) {
                afterDrag.current = true
                setTimeout(() => (afterDrag.current = false), 0)
            }
            if (!finishedBox || Math.hypot(finishedBox.to.x - finishedBox.from.x, finishedBox.to.y - finishedBox.from.y) < MIN_DRAG) return
            afterDrag.current = true
            setTimeout(() => (afterDrag.current = false), 0)
            const taken = shapesInBox(draft.shapes, finishedBox.from, finishedBox.to)
            setSelected((current) => (finishedBox.add ? [...new Set([...current, ...taken])] : taken))
        }
        addEventListener('mousemove', onMove)
        addEventListener('mouseup', onUp)
        return () => {
            removeEventListener('mousemove', onMove)
            removeEventListener('mouseup', onUp)
        }
    }, [dragging])
    const onDrawingMove = (event) => {
        const point = gridPointOf(event)
        setHover((current) => (current && current.x === point.x && current.y === point.y ? current : point))
    }
    // Escape cancels the shape that is being drawn (or the selection); Delete / Backspace removes the selected shapes
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setAnchor(null)
                setSelected([])
                boxRef.current = null
                setBox(null)
                const originals = moveRef.current?.originals // (read now: the updater below runs after the ref is cleared)
                if (originals) setDraft((current) => ({...current, shapes: originals})) // cancels a drag
                moveRef.current = null
                setMoving(false)
            } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
                event.preventDefault()
                deleteSelected()
            }
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    })
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
    // a copy is always an own symbol of the user (personal; he can put it in one of his groups)
    const duplicate = () =>
        open({...draft, k: 'custom:' + newId(), name: t('common.copyOf', {name: draft.name}), builtin: false, modified: false, v: 0, group: null, editable: true}, true)
    const groupName = (id) => groups.find((group) => group.id === id)?.name ?? '#' + id
    // the selected shapes and the frame around them (indexes that no longer exist are left out)
    const chosen = draft ? selected.map((i) => draft.shapes[i]).filter(Boolean) : [],
        bounds = unionBounds(chosen)
    const categories = [...new Set(library.map((symbol) => symbol.cat))],
        searchText = search.toLowerCase()
    // the list of components reaches to the bottom of the window at the most and scrolls inside
    useFillHeight(menu)
    return (
        <div className="row comp">
            <div className="side ui pal sticky-side fill" id="comp-menu" ref={menu}>
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
                {mayChangeStandard && (
                    <button id="comp-restore-all" title={t('symbolEditor.restoreAllTitle')} onClick={restoreAll}>
                        {t('symbolEditor.restoreAll')}
                    </button>
                )}
                <div className="complist fill-grow">
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
                        {readOnly ? (
                            <p id="comp-read-only" className="chint">
                                {t(isStandard ? 'symbolEditor.readOnlyStandard' : 'symbolEditor.readOnlyGroup')}
                            </p>
                        ) : (
                            <p id="comp-hint" className="chint">{t('symbolEditor.drawingHint')}</p>
                        )}
                        <div className="tb cgroup cactions">
                            {!readOnly && (
                                <button id="comp-save" className="accent" onClick={save}>
                                    {isStored ? t('common.save') : t('symbolEditor.add')}
                                </button>
                            )}
                            <button id="comp-duplicate" className={readOnly ? 'accent' : undefined} onClick={duplicate}>
                                {t('symbolEditor.duplicate')}
                            </button>
                            {!readOnly && (
                                <>
                                    <button id="comp-undo-shape" title={t('symbolEditor.undoShape')} onClick={() => change({shapes: draft.shapes.slice(0, -1)})}>
                                        ↶
                                    </button>
                                    <button id="comp-clear" onClick={() => change({shapes: []})}>
                                        {t('symbolEditor.clear')}
                                    </button>
                                </>
                            )}
                            {dirty && <span id="comp-dirty">● {t('symbolEditor.unsaved')}</span>}
                            {message && <span id="comp-message">{message}</span>}
                            <small id="comp-origin" style={{marginLeft: 'auto'}}>
                                {t(originKey(draft), {group: draft.group != null ? groupName(draft.group) : ''})}
                            </small>
                        </div>
                        <div className="cwork">
                            <div className="ctools">
                                {!readOnly && (
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
                                                    setSelected([])
                                                }}
                                            >
                                                {t('symbolEditor.tools.' + name)}
                                            </button>
                                        ))}
                                        <button id="comp-delete-selected" disabled={!selected.length} title={t('symbolEditor.deleteSelectedTitle')} onClick={deleteSelected}>
                                            {t('symbolEditor.deleteSelected', {count: selected.length})}
                                        </button>
                                    </div>
                                )}
                                {!readOnly && (isStandard || isStored) && (
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
                                <svg id="comp-drawing" ref={svgRef} onMouseDown={onDrawingDown} className={tool === 'select' ? 'selecting' : undefined} viewBox="0 0 24 24" onClick={onDrawingClick} onMouseMove={onDrawingMove} onMouseLeave={() => setHover(null)}>
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
                                    {tool === 'select' && (
                                        <>
                                            {/* the selection like on the situatieschema: blue marking over the shapes, a dashed frame around them and a trash button */}
                                            {chosen.length > 0 && (
                                                <g id="comp-selection" pointerEvents="none">
                                                    <g opacity=".4">
                                                        <SymbolGraphic shapes={chosen} x={12} y={12} size={24} strokeWidth={1.4} stroke={SELECTION_COLOUR} />
                                                    </g>
                                                    <rect
                                                        x={bounds.x1 - 0.8}
                                                        y={bounds.y1 - 0.8}
                                                        width={bounds.x2 - bounds.x1 + 1.6}
                                                        height={bounds.y2 - bounds.y1 + 1.6}
                                                        fill="none"
                                                        stroke={SELECTION_COLOUR}
                                                        strokeWidth=".1"
                                                        strokeDasharray=".5 .4"
                                                    />
                                                </g>
                                            )}
                                            {hovered !== null && !selected.includes(hovered) && draft.shapes[hovered] && !moving && (
                                                <g pointerEvents="none" opacity=".25">
                                                    <SymbolGraphic shapes={[draft.shapes[hovered]]} x={12} y={12} size={24} strokeWidth={1.4} stroke={SELECTION_COLOUR} />
                                                </g>
                                            )}
                                            {/* invisible, wider copies of the shapes: the click targets (last drawn on top) */}
                                            <g id="comp-hit">
                                                {draft.shapes.map((shape, index) => (
                                                    <g
                                                        key={index}
                                                        data-shape={index}
                                                        style={{cursor: 'move'}}
                                                        onMouseDown={(event) => pressShape(event, index)}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onMouseEnter={() => setHovered(index)}
                                                        onMouseLeave={() => setHovered(null)}
                                                    >
                                                        <SymbolGraphic shapes={[{...shape, sw: undefined}]} x={12} y={12} size={24} strokeWidth={HIT_WIDTH} stroke="transparent" />
                                                    </g>
                                                ))}
                                            </g>
                                            {box && (
                                                <rect
                                                    id="comp-box"
                                                    x={Math.min(box.from.x, box.to.x)}
                                                    y={Math.min(box.from.y, box.to.y)}
                                                    width={Math.abs(box.to.x - box.from.x)}
                                                    height={Math.abs(box.to.y - box.from.y)}
                                                    fill={SELECTION_COLOUR}
                                                    fillOpacity=".08"
                                                    stroke={SELECTION_COLOUR}
                                                    strokeWidth=".1"
                                                    strokeDasharray=".5 .4"
                                                    pointerEvents="none"
                                                />
                                            )}
                                            {chosen.length > 0 && !dragging && (
                                                <g
                                                    id="comp-delete-selection"
                                                    role="button"
                                                    aria-label={t('symbolEditor.deleteSelectedTitle')}
                                                    transform={`translate(${Math.min(22.6, bounds.x2 + 2)},${Math.max(1.4, bounds.y1 - 2)}) scale(.34)`}
                                                    style={{cursor: 'pointer'}}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        deleteSelected()
                                                    }}
                                                >
                                                    <title>{t('symbolEditor.deleteSelectedTitle')}</title>
                                                    <circle r="3.2" fill="#fff" stroke="#c62828" strokeWidth=".5" />
                                                    <path
                                                        d="M-1.5,-1.3 H1.5 M-.7,-1.3 V-2 H.7 V-1.3 M-1.2,-.7 L-.95,2.1 H.95 L1.2,-.7"
                                                        fill="none"
                                                        stroke="#c62828"
                                                        strokeWidth=".35"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </g>
                                            )}
                                        </>
                                    )}
                                    {anchor && hover && tool !== 'text' && tool !== 'select' && (
                                        <g id="comp-shape-preview" opacity=".75" strokeDasharray=".6 .4" pointerEvents="none">
                                            <SymbolGraphic shapes={[shapeTo(hover.x, hover.y)]} x={12} y={12} size={24} strokeWidth={0.5} stroke="#0a6cff" />
                                        </g>
                                    )}
                                    {hover && tool !== 'select' && <circle id="comp-hover-point" cx={hover.x} cy={hover.y} r=".25" fill="#0a6cff" pointerEvents="none" />}
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
                                <fieldset id="comp-fields" disabled={readOnly} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
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
                                        {!isStandard && (
                                            <label>
                                                {t('symbolEditor.belongsTo')}
                                                <select
                                                    id="comp-group"
                                                    disabled={groups.length === 0 && draft.group == null}
                                                    title={groups.length === 0 && draft.group == null ? t('symbolEditor.noGroups') : undefined}
                                                    value={draft.group ?? ''}
                                                    onChange={(event) => change({group: event.target.value === '' ? null : Number(event.target.value)})}
                                                >
                                                    <option value="">{t('symbolEditor.personal')}</option>
                                                    {groups.map((group) => (
                                                        <option key={group.id} value={group.id}>
                                                            {t('symbolEditor.group', {group: group.name})}
                                                        </option>
                                                    ))}
                                                    {draft.group != null && !groups.some((group) => group.id === draft.group) && (
                                                        <option value={draft.group}>{t('symbolEditor.group', {group: groupName(draft.group)})}</option>
                                                    )}
                                                </select>
                                            </label>
                                        )}
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
                                </fieldset>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
