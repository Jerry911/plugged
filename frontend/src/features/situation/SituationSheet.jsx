// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// One situatieschema page drawn on a sheet: walls, doors, windows, texts and symbols. In the editor (`editor` given) it also draws the
// grid, the selection, the wall being drawn and the selection box.
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {allTypes, typeOf} from '../../symbols/symbolLibrary.js'
import {placedShapesOf} from '../../symbols/symbolShapes.js'
import Sheet from '../../components/Sheet.jsx'
import {circuitMarks, placeableNodes} from '../../model/project.js'
import {formatLength, scaleOf} from '../../model/geometry.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

/** The default size (mm on the sheet) of each kind of item. */
export const DEFAULT_ITEM_SIZE = {sym: 7, text: 4, door: 10, window: 10}
export const SELECTION_COLOUR = '#0a6cff'
// line weight of the symbols on the drawing (in the 24 grid of a symbol: it scales with the size of the symbol, the default of SymbolGraphic is 1.5)
const SYMBOL_STROKE_WIDTH = 1

/** The real length of a segment as a label next to it (always upright, left of the direction of travel). */
export const LengthLabel = ({from, to, scale, colour = '#555', offset = 3}) => {
    const flipped = to.x < from.x || (to.x === from.x && to.y < from.y),
        [start, end] = flipped ? [to, from] : [from, to],
        dx = end.x - start.x,
        dy = end.y - start.y,
        length = Math.hypot(dx, dy)
    if (length < 2) return null
    const labelX = (start.x + end.x) / 2 + (dy / length) * offset,
        labelY = (start.y + end.y) / 2 - (dx / length) * offset
    return (
        <text
            className="length-label"
            x={labelX}
            y={labelY}
            fontSize="2.4"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colour}
            transform={`rotate(${(Math.atan2(dy, dx) * 180) / Math.PI} ${labelX} ${labelY})`}
            pointerEvents="none"
        >
            {formatLength(length, scale)}
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
 * page = the situatieschema page; number / total = its sheet number. `editor` (only in the editing view):
 * {svgRef, selection, interactionProps(kind, id, part), pending, typedEnd, cursor, tool, gridSize, selectionBox, deleteButton, sheetEvents}.
 */
export function SituationSheet({project, page, number, total, editor, onFooter}) {
    const {t} = useTranslation()
    const nodes = placeableNodes(project),
        marks = circuitMarks(project),
        {walls, items} = page,
        scale = scaleOf(project.footer),
        showLengths = page.dims !== false,
        isSelected = (id) => !!editor && editor.selection.some((entry) => entry.id === id),
        interaction = (kind, id, part) => (editor ? editor.interactionProps(kind, id, part) : {})
    return (
        <Sheet
            project={project}
            number={number}
            total={total}
            onFooter={onFooter}
            svgRef={editor?.svgRef}
            sheetId={editor ? 'sit-sheet' : undefined}
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
                            id={'sit-wall-' + wall.id}
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
                            <circle key={end} id={`sit-wall-${wall.id}-${end}`} {...interaction('wall', wall.id, end)} cx={x} cy={y} r="1.8" fill={SELECTION_COLOUR} />
                        ))}
                </g>
            ))}
            {showLengths &&
                walls.map((wall) => <LengthLabel key={'d' + wall.id} from={{x: wall.x1, y: wall.y1}} to={{x: wall.x2, y: wall.y2}} scale={scale} />)}
            {items.map((item) => {
                const size = item.s || item.w || DEFAULT_ITEM_SIZE[item.kind],
                    selected = isSelected(item.id),
                    itemProps = editor ? {id: 'sit-item-' + item.id, ...interaction('item', item.id)} : {}
                if (item.kind === 'sym') {
                    // linked to an element of the eendraadschema (name + marking), or a general library component (`type`, no marking)
                    const node = item.node ? nodes.find((candidate) => candidate.id === item.node) : null,
                        looseType = !item.node && item.type ? allTypes(project).find((symbolType) => symbolType.k === item.type) : null,
                        // a socket is drawn with the 'h' when it is waterproof: the property of the element of the eendraadschema (so it follows
                        // there), else of the loose symbol
                        shapes = node ? placedShapesOf(typeOf(project, node.type), node.p) : looseType && placedShapesOf(looseType, {h: item.h}),
                        // text next to the symbol: the marking of the eendraadschema element (A5), unless the user typed their own
                        label = item.mark ?? (node ? marks.get(node.id) || '' : '')
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
                                <text x={item.x + size / 2 + 1} y={item.y} fontSize="2.6" fontWeight="bold" dominantBaseline="middle">
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
                    id="sit-selection-box"
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
                    id="sit-delete-selection"
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
        </Sheet>
    )
}
