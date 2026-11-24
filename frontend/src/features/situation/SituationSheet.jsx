// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// One situatieschema page drawn on a sheet: walls, doors, windows, texts and symbols. In the editor (`editor` given) it also draws the
// grid, the selection, the wall being drawn and the selection box. A page of the bedradingsschema is drawn the same way, with its rectangles and
// wires on top (see WiringLayers.jsx).
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {allTypes, typeOf} from '../../symbols/symbolLibrary.js'
import {placedShapesOf} from '../../symbols/symbolShapes.js'
import Sheet from '../../components/Sheet.jsx'
import {circuitMarks, placeableNodes} from '../../model/project.js'
import {formatLength, scaleOf} from '../../model/geometry.js'
import {formatArea, roomArea, roomAt, roomFaces} from '../../model/rooms.js'
import {centredTextBox, placeLabels, symbolExtent} from '../../model/labelPlacement.js'
import {unionBounds} from '../../symbols/shapeHit.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {endResolver, pinPosition, symbolPins} from '../../model/wiring.js'
import {BoxesLayer, WiresLayer} from '../wiring/WiringLayers.jsx'

/** The default size (mm on the sheet) of each kind of item. */
export const DEFAULT_ITEM_SIZE = {sym: 7, text: 4, door: 10, window: 10}
export const SELECTION_COLOUR = '#0a6cff'
// line weight of the symbols on the drawing (in the 24 grid of a symbol: it scales with the size of the symbol, the default of SymbolGraphic is 1.5)
const SYMBOL_STROKE_WIDTH = 1

const LENGTH_FONT_SIZE = 2.4

/** Are the lengths of walls (and wires) written? On a plan unless switched off, on a page of the bedradingsschema only when switched on. */
export const showsLengths = (page) => (page.wires ? page.dims === true : page.dims !== false)

/**
 * The symbols of a plan are drawn bigger than their own size by the symbol size of the page (the slider "Symbolen" under the plan): they do not
 * follow the scale of the drawing, they have to be easy to see and to pick. A page without its own size has the default. A page of the
 * bedradingsschema (with wires) draws its symbols at their own size: there they connect to wires.
 */
export const SYMBOL_SCALE = {min: 0.5, max: 4, step: 0.1, default: 1.5}
export const symbolScaleOf = (page) => (page.wires ? 1 : Number(page.symScale) || SYMBOL_SCALE.default)
/** The items of a page as they are drawn: the symbols at their size times the symbol size of the page. */
export const shownItems = (page) => {
    const factor = symbolScaleOf(page)
    return factor === 1
        ? page.items
        : page.items.map((item) => (item.kind === 'sym' ? {...item, s: Math.round((item.s || DEFAULT_ITEM_SIZE.sym) * factor * 100) / 100} : item))
}

/** The size of an item on the sheet (mm). */
export const sizeOfItem = (item) => item.s || item.w || DEFAULT_ITEM_SIZE[item.kind]

/** The symbol type of a symbol item: the one of its element of the eendraadschema, or its own (a loose symbol); null when it is gone. */
export const itemTypeOf = (project, item, nodes = placeableNodes(project)) => {
    if (item.kind !== 'sym') return null
    const node = item.node ? nodes.find((candidate) => candidate.id === item.node) : null
    return node ? typeOf(project, node.type) : (item.type && allTypes(project).find((symbolType) => symbolType.k === item.type)) || null
}

/** The connection points of the symbols of a page on the sheet: pinsOf(item) = [{x, y}] (see model/wiring.js). */
export const pagePins = (project, nodes = placeableNodes(project)) => {
    const cache = new Map()
    return (item) => {
        const key = `${item.id}:${item.x},${item.y},${item.r},${item.s},${item.type}`
        if (!cache.has(key))
            cache.set(
                key,
                symbolPins(itemTypeOf(project, item, nodes)).map((pin) => pinPosition(item, pin, sizeOfItem(item))),
            )
        return cache.get(key)
    }
}

/** Where the length of a segment is written: {x, y, angle, text}, or null for a segment too short to label. */
const lengthLabelOf = (from, to, scale, offset = 3) => {
    const flipped = to.x < from.x || (to.x === from.x && to.y < from.y),
        [start, end] = flipped ? [to, from] : [from, to],
        dx = end.x - start.x,
        dy = end.y - start.y,
        length = Math.hypot(dx, dy)
    if (length < 2) return null
    return {
        x: (start.x + end.x) / 2 + (dy / length) * offset,
        y: (start.y + end.y) / 2 - (dx / length) * offset,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        text: formatLength(length, scale),
    }
}

/** The box the length of a wall takes on the sheet (null for a wall too short to label). */
export const lengthLabelBox = (wall, scale) => {
    const label = lengthLabelOf({x: wall.x1, y: wall.y1}, {x: wall.x2, y: wall.y2}, scale)
    return label && centredTextBox(label.x, label.y, label.angle, label.text.length * LENGTH_FONT_SIZE * 0.55, LENGTH_FONT_SIZE)
}

/** The real length of a segment as a label next to it (always upright, left of the direction of travel). */
export const LengthLabel = ({from, to, scale, colour = '#555', offset = 3}) => {
    const label = lengthLabelOf(from, to, scale, offset)
    if (!label) return null
    return (
        <text
            className="length-label"
            x={label.x}
            y={label.y}
            fontSize={LENGTH_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colour}
            transform={`rotate(${label.angle} ${label.x} ${label.y})`}
            pointerEvents="none"
        >
            {label.text}
        </text>
    )
}

const SelectionRing = ({size}) => (
    <circle r={Math.max(size, 8) / 1.5} fill="none" stroke={SELECTION_COLOUR} strokeWidth=".4" strokeDasharray="1 1" pointerEvents="none" />
)

// The dashed preview of the wall or room being drawn (`end` = the mouse or the typed length) and its real length(s).
const DrawingPreview = ({editor, scale}) => {
    const {pending, typedEnd, cursor, tool} = editor
    if (!pending) return null
    const dashed = {stroke: SELECTION_COLOUR, strokeWidth: '.6', strokeDasharray: '1.5 1', pointerEvents: 'none'},
        typed = {stroke: SELECTION_COLOUR, strokeWidth: '1.2', opacity: '.6', pointerEvents: 'none'},
        rectangle = (end) => ({
            x: Math.min(pending.x, end.x),
            y: Math.min(pending.y, end.y),
            width: Math.abs(end.x - pending.x),
            height: Math.abs(end.y - pending.y),
            fill: 'none',
        })
    return (
        <>
            <circle cx={pending.x} cy={pending.y} r="1" fill="red" />
            {typedEnd &&
                (tool === 'wall' ? (
                    <>
                        <line x1={pending.x} y1={pending.y} x2={typedEnd.x} y2={typedEnd.y} {...typed} />
                        <LengthLabel from={pending} to={typedEnd} scale={scale} colour={SELECTION_COLOUR} />
                    </>
                ) : (
                    <rect {...rectangle(typedEnd)} {...typed} />
                ))}
            {cursor && tool === 'wall' && (
                <>
                    <line x1={pending.x} y1={pending.y} x2={cursor.x} y2={cursor.y} {...dashed} />
                    <LengthLabel from={pending} to={cursor} scale={scale} colour={SELECTION_COLOUR} />
                </>
            )}
            {cursor && tool === 'room' && (
                <>
                    <rect {...rectangle(cursor)} {...dashed} />
                    <LengthLabel from={pending} to={{x: cursor.x, y: pending.y}} scale={scale} colour={SELECTION_COLOUR} />
                    <LengthLabel from={pending} to={{x: pending.x, y: cursor.y}} scale={scale} colour={SELECTION_COLOUR} />
                </>
            )}
        </>
    )
}

/**
 * page = the situatieschema (or bedradingsschema) page; number / total = its sheet number. `editor` (only in the editing view):
 * {svgRef, prefix, selection, interactionProps(kind, id, part), pending, typedEnd, cursor, tool, gridSize, selectionBox, deleteButton, copyButton, sheetEvents,
 * pins, wirePreview, boxPreview}; prefix ('sit' or 'wire') starts the ids of the elements.
 */
export function SituationSheet({project, page, number, total, editor, onFooter}) {
    const {t, language} = useTranslation()
    const nodes = placeableNodes(project),
        marks = circuitMarks(project),
        {walls} = page,
        items = shownItems(page),
        wires = page.wires || [],
        boxes = page.boxes || [],
        prefix = editor?.prefix || 'sit',
        scale = scaleOf(project.footer),
        showLengths = showsLengths(page),
        // the rooms the walls enclose, only worked out when a text asks for the area of its room
        faces = items.some((item) => item.kind === 'text' && item.area) ? roomFaces(walls) : [],
        areaOf = (item) => {
            const face = roomAt(faces, {x: item.x + (String(item.txt || '').length * (item.s || DEFAULT_ITEM_SIZE.text) * 0.55) / 2, y: item.y})
            return face ? formatArea(roomArea(face, scale), language) : null
        },
        isSelected = (id) => !!editor && editor.selection.some((entry) => entry.id === id),
        sizeOf = sizeOfItem,
        // text next to a symbol: the marking of the eendraadschema element (A5), unless the user typed their own
        labelOf = (item) => item.mark ?? (item.node && nodes.some((node) => node.id === item.node) ? marks.get(item.node) || '' : ''),
        // the lines of a symbol: of its element of the eendraadschema (name + marking), or of a general library component (`type`, no marking);
        // a socket is drawn with the 'h' when it is waterproof: the property of the element of the eendraadschema (so it follows there), else
        // of the loose symbol
        shapesOf = (item) => {
            const node = item.node ? nodes.find((candidate) => candidate.id === item.node) : null,
                symbolType = itemTypeOf(project, item, nodes)
            return symbolType && placedShapesOf(symbolType, node ? node.p : {h: item.h})
        },
        // what a symbol really covers (its lines, turned): its marking comes right next to that, not next to the square it is drawn in
        extentOf = (item) =>
            item.kind === 'sym' ? symbolExtent(unionBounds(shapesOf(item) || []), sizeOf(item), item.r || 0, SYMBOL_STROKE_WIDTH) : undefined,
        // every marking goes to a free spot around its symbol: not behind a wall, another symbol or another marking
        labelSpots = placeLabels(
            walls,
            items.map((item) => ({item, size: sizeOf(item), extent: extentOf(item)})),
            items.filter((item) => item.kind === 'sym' && labelOf(item)).map((item) => ({item, size: sizeOf(item), text: labelOf(item), extent: extentOf(item)})),
            showLengths ? walls.map((wall) => lengthLabelBox(wall, scale)).filter(Boolean) : [],
        ),
        interaction = (kind, id, part) => (editor ? editor.interactionProps(kind, id, part) : {}),
        resolve = endResolver(items, pagePins(project, nodes))
    return (
        <Sheet
            project={project}
            number={number}
            total={total}
            onFooter={onFooter}
            svgRef={editor?.svgRef}
            sheetId={editor ? prefix + '-sheet' : undefined}
            {...(editor?.sheetEvents || {})}
        >
            {editor && (
                <>
                    <defs>
                        {[
                            ['gMinor', editor.gridSize, Math.min(0.25, editor.gridSize * 0.12), '#8a8a8a'],
                            ['gMajor', Math.max(10, editor.gridSize), 0.35, '#444'],
                        ].map(([id, spacing, dotRadius, colour]) => (
                            <pattern key={id} id={id} x={-spacing / 2} y={-spacing / 2} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
                                <circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill={colour} />
                            </pattern>
                        ))}
                    </defs>
                    <rect x="5" y="5" width="287" height="180" fill="url(#gMinor)" />
                    <rect x="5" y="5" width="287" height="180" fill="url(#gMajor)" />
                </>
            )}
            {walls.map((wall) => (
                <g key={wall.id}>
                    <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="#000" strokeWidth="1.6" strokeLinecap="square" />
                    {isSelected(wall.id) && (
                        <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke={SELECTION_COLOUR} strokeWidth="2.6" opacity=".4" pointerEvents="none" />
                    )}
                    {editor && (
                        <line
                            id={`${prefix}-wall-${wall.id}`}
                            {...interaction('wall', wall.id, 'm')}
                            x1={wall.x1}
                            y1={wall.y1}
                            x2={wall.x2}
                            y2={wall.y2}
                            stroke="transparent"
                            strokeWidth="7"
                        />
                    )}
                    {isSelected(wall.id) &&
                        editor.selection.length === 1 &&
                        [
                            ['a', wall.x1, wall.y1],
                            ['b', wall.x2, wall.y2],
                        ].map(([end, x, y]) => (
                            <circle
                                key={end}
                                id={`${prefix}-wall-${wall.id}-${end}`}
                                {...interaction('wall', wall.id, end)}
                                cx={x}
                                cy={y}
                                r="1.8"
                                fill={SELECTION_COLOUR}
                            />
                        ))}
                </g>
            ))}
            {showLengths &&
                walls.map((wall) => <LengthLabel key={'d' + wall.id} from={{x: wall.x1, y: wall.y1}} to={{x: wall.x2, y: wall.y2}} scale={scale} />)}
            <BoxesLayer boxes={boxes} editor={editor} prefix={prefix} isSelected={isSelected} interaction={interaction} />
            {items.map((item) => {
                const size = sizeOf(item),
                    selected = isSelected(item.id),
                    itemProps = editor ? {id: `${prefix}-item-${item.id}`, ...interaction('item', item.id)} : {}
                if (item.kind === 'sym') {
                    const shapes = shapesOf(item),
                        label = labelOf(item),
                        spot = labelSpots.get(item.id)
                    return (
                        <g key={item.id} {...itemProps}>
                            <g transform={`translate(${item.x},${item.y})`}>
                                {editor && <circle r={Math.max(size / 2 + 1.5, 4.5)} fill="transparent" />}
                                {selected && <SelectionRing size={size} />}
                                <g transform={`rotate(${item.r || 0})`}>
                                    {shapes ? (
                                        <SymbolGraphic shapes={shapes} size={size} strokeWidth={SYMBOL_STROKE_WIDTH} rotation={item.r || 0} />
                                    ) : (
                                        <circle r="3" fill="none" stroke="red" />
                                    )}
                                </g>
                            </g>
                            {!shapes && (
                                <text className="deleted-symbol" x={item.x} y={item.y + size / 2 + 2.5} fontSize="2.2" textAnchor="middle">
                                    {t('situation.deletedSymbol')}
                                </text>
                            )}
                            {label && (
                                <text
                                    className="symbol-mark"
                                    data-side={spot.side}
                                    x={spot.x}
                                    y={spot.y}
                                    fontSize={spot.fontSize}
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                >
                                    {label}
                                </text>
                            )}
                        </g>
                    )
                }
                if (item.kind === 'text')
                    return (
                        <g key={item.id} {...itemProps}>
                            <g transform={`rotate(${item.r || 0} ${item.x} ${item.y})`}>
                                {editor && (
                                    <rect
                                        x={item.x - 1}
                                        y={item.y - size - 1}
                                        width={Math.max(size, String(item.txt || '').length * size * 0.55) + 2}
                                        height={size * 1.3 + 2}
                                        fill="transparent"
                                    />
                                )}
                                <text x={item.x} y={item.y} fontSize={size}>
                                    {item.txt}
                                </text>
                                {item.area && areaOf(item) && (
                                    <text id={prefix + '-area-' + item.id} className="roomarea" x={item.x} y={item.y + size * 1.15} fontSize={size * 0.8} fill="#555">
                                        {areaOf(item)}
                                    </text>
                                )}
                            </g>
                            {selected && <circle cx={item.x} cy={item.y} r="2" fill="none" stroke={SELECTION_COLOUR} />}
                        </g>
                    )
                // a door or a window: a gap in the wall with the swing of the door or the double line of the window
                const width = item.w || 10,
                    halfWidth = width / 2,
                    isDoor = item.kind === 'door'
                return (
                    <g
                        key={item.id}
                        {...itemProps}
                        transform={`translate(${item.x},${item.y}) rotate(${item.r || 0}) scale(${item.m ? -1 : 1},${item.f ? -1 : 1})`}
                        stroke="#000"
                        strokeWidth=".4"
                    >
                        {editor && (
                            <rect x={-halfWidth - 1} y={isDoor ? -width - 1 : -3} width={width + 2} height={isDoor ? width + 4 : 6} fill="transparent" stroke="none" />
                        )}
                        {selected && <SelectionRing size={size} />}
                        <rect x={-halfWidth} y="-1.3" width={width} height="2.6" fill="#fff" stroke="none" />
                        {isDoor ? (
                            <>
                                <line x1={-halfWidth} y1="0" x2={-halfWidth} y2={-width} strokeWidth=".6" />
                                <path d={`M${-halfWidth},${-width} A${width},${width} 0 0 1 ${halfWidth},0`} fill="none" />
                            </>
                        ) : (
                            <>
                                <line x1={-halfWidth} y1="-1" x2={halfWidth} y2="-1" />
                                <line x1={-halfWidth} y1="1" x2={halfWidth} y2="1" />
                            </>
                        )}
                    </g>
                )
            })}
            <WiresLayer
                wires={wires}
                resolve={resolve}
                editor={editor}
                prefix={prefix}
                isSelected={isSelected}
                interaction={interaction}
                showLengths={showLengths}
                scale={scale}
            />
            {editor && <DrawingPreview editor={editor} scale={scale} />}
            {editor?.cursor && (
                <g pointerEvents="none" stroke={SELECTION_COLOUR} strokeWidth=".35" fill="none">
                    <circle cx={editor.cursor.x} cy={editor.cursor.y} r="1.4" />
                    <line x1={editor.cursor.x - 2.6} y1={editor.cursor.y} x2={editor.cursor.x + 2.6} y2={editor.cursor.y} />
                    <line x1={editor.cursor.x} y1={editor.cursor.y - 2.6} x2={editor.cursor.x} y2={editor.cursor.y + 2.6} />
                </g>
            )}
            {editor?.selectionBox && (
                <rect
                    id={prefix + '-selection-box'}
                    x={Math.min(editor.selectionBox.from.x, editor.selectionBox.to.x)}
                    y={Math.min(editor.selectionBox.from.y, editor.selectionBox.to.y)}
                    width={Math.abs(editor.selectionBox.to.x - editor.selectionBox.from.x)}
                    height={Math.abs(editor.selectionBox.to.y - editor.selectionBox.from.y)}
                    fill={SELECTION_COLOUR}
                    fillOpacity=".08"
                    stroke={SELECTION_COLOUR}
                    strokeWidth=".4"
                    strokeDasharray="1.5 1"
                    pointerEvents="none"
                />
            )}
            {editor?.deleteButton && (
                <g
                    id={prefix + '-delete-selection'}
                    role="button"
                    aria-label={t('situation.deleteSelection')}
                    transform={`translate(${editor.deleteButton.x},${editor.deleteButton.y})`}
                    style={{cursor: 'pointer'}}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        editor.deleteButton.onClick()
                    }}
                >
                    <title>{t('situation.deleteSelectionTitle')}</title>
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
            {editor?.copyButton && (
                <g
                    id={prefix + '-copy-selection'}
                    role="button"
                    aria-label={t('situation.copySelection')}
                    transform={`translate(${editor.copyButton.x},${editor.copyButton.y})`}
                    style={{cursor: 'pointer'}}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        editor.copyButton.onClick()
                    }}
                >
                    <title>{t('situation.duplicateTitle')}</title>
                    <circle r="3.2" fill="#fff" stroke={SELECTION_COLOUR} strokeWidth=".5" />
                    <path
                        d="M-.6,-.6 H1.6 V1.6 H-.6 Z M-1.4,.6 H-1.6 V-1.6 H.6 V-1.4"
                        fill="none"
                        stroke={SELECTION_COLOUR}
                        strokeWidth=".35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </g>
            )}
        </Sheet>
    )
}
