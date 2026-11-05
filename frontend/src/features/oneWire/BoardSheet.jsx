// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// One printed sheet of an eendraadschema page: the bus with the head (kWh meter, earth, main breaker) and the circuits of one slice of the
// board layout (see model/boardLayout.js for the drawn items).
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import Sheet from '../../components/Sheet.jsx'
import {BUS_START_X, DRAWING_WIDTH, busPosition, sheetScale} from '../../model/boardLayout.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

const SELECTED_COLOUR = '#0a6cff'
const FONT_FAMILY = 'Verdana, DejaVu Sans, sans-serif'

// small trash can in the top right corner of the selected element (only when the sheet is given an onDelete handler)
const DeleteButton = ({x, y, onDelete}) => {
    const {t} = useTranslation()
    return (
        <g
            id="eds-drawing-delete"
            style={{cursor: 'pointer'}}
            onClick={(event) => {
                event.stopPropagation()
                onDelete()
            }}
        >
            <title>{t('common.delete')}</title>
            <circle cx={x} cy={y} r="10" fill="#fff" stroke="#c0392b" strokeWidth="1.5" />
            <g
                transform={`translate(${x},${y}) scale(0.62) translate(-12,-12)`}
                fill="none"
                stroke="#c0392b"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
            </g>
        </g>
    )
}

// symbols are drawn in a 24-unit box scaled by size/24: compensate so their stroke equals the connection lines
const LINE_WIDTH = 2

/**
 * One drawn item. `ghost` is the id of the element that is previewed while a symbol is dragged onto the drawing; `inGhostCircuit` draws the
 * whole item in blue (the elements of a circuit that is previewed).
 */
const DrawnItem = ({item, selected, ghost, inGhostCircuit, onSelect, onDelete}) => {
    const isGhost = !!ghost && item.id === ghost,
        highlighted = isGhost || inGhostCircuit || (selected && item.id === selected),
        colour = highlighted ? SELECTED_COLOUR : '#000',
        lineColour = inGhostCircuit ? SELECTED_COLOUR : '#000',
        clickable = {
            ...(item.id ? {'data-nid': item.id} : {}),
            ...(item.id && onSelect ? {onClick: () => onSelect(item.id), style: {cursor: 'pointer'}} : {}),
        }
    // in the editor the plain lines and the texts without an id do not take the pointer: the click area and the latch zone below them do
    const passThrough = onSelect ? {style: {pointerEvents: 'none'}} : {}
    switch (item.kind) {
        case 'circ':
            return <circle cx={item.x} cy={item.y} r={item.r} fill="none" stroke={lineColour} strokeWidth={LINE_WIDTH} />
        case 'hit':
            // transparent click area of a circuit (only in the editor, never in the export); light blue when the circuit is selected.
            // It carries no data-nid: that one belongs to the drawn elements (letter, symbols).
            return onSelect && item.id ? (
                <rect
                    className="eds-hit"
                    data-hit={item.id}
                    onClick={() => onSelect(item.id)}
                    style={{cursor: 'pointer'}}
                    x={item.x}
                    y={item.y}
                    width={item.w}
                    height={item.h}
                    fill={highlighted ? 'rgba(10,108,255,0.08)' : 'transparent'}
                />
            ) : null
        case 'stem':
            // latch zone along the stem of a circuit (editor only, active while a symbol is dragged, see .eds-dragging): a symbol dragged into it
            // becomes the next branch of that circuit
            return onSelect && item.id ? (
                <rect className="eds-stem" data-stem={item.id} x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" />
            ) : null
        case 'line':
            return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={lineColour} strokeWidth={item.w || LINE_WIDTH} {...passThrough} />
        case 'sym': {
            const clickAreaSize = Math.max(60, item.size),
                graphic = (
                    <SymbolGraphic
                        shapes={item.shapes}
                        x={item.x}
                        y={item.y}
                        size={item.size}
                        stroke={colour}
                        strokeWidth={(LINE_WIDTH * 24) / item.size}
                        rotation={item.rotation || 0}
                    />
                )
            return (
                <>
                    {isGhost && (
                        <circle
                            cx={item.x}
                            cy={item.y}
                            r={item.size * 0.8}
                            fill="rgba(10,108,255,0.12)"
                            stroke={SELECTED_COLOUR}
                            strokeWidth="1"
                            strokeDasharray="4 3"
                        />
                    )}
                    <g {...clickable}>
                        {clickable.onClick && (
                            <rect x={item.x - clickAreaSize / 2} y={item.y - clickAreaSize / 2} width={clickAreaSize} height={clickAreaSize} fill="transparent" />
                        )}
                        {item.rotation ? <g transform={`rotate(${item.rotation} ${item.x} ${item.y})`}>{graphic}</g> : graphic}
                    </g>
                    {highlighted && !isGhost && onDelete && <DeleteButton x={item.x + 30} y={item.y - 30} onDelete={onDelete} />}
                </>
            )
        }
        case 'rect':
            return (
                <>
                    <rect
                        {...clickable}
                        x={item.x}
                        y={item.y}
                        width={item.w}
                        height={item.h}
                        fill={item.fill ? '#000' : '#fff'}
                        stroke={colour}
                        strokeWidth={item.id ? 3 : 1.5}
                    />
                    {highlighted && !isGhost && onDelete && <DeleteButton x={item.x + item.w} y={item.y} onDelete={onDelete} />}
                </>
            )
        default:
            return (
                <text
                    {...clickable}
                    {...(item.id ? {} : passThrough)}
                    transform={item.vertical ? `translate(${item.x},${item.y}) rotate(-90)` : undefined}
                    x={item.vertical ? 0 : item.x}
                    y={item.vertical ? 0 : item.y}
                    fontSize={item.fontSize || 13}
                    fontWeight={item.bold ? 700 : 400}
                    fontStyle={item.italic ? 'italic' : 'normal'}
                    textAnchor={item.anchor || 'start'}
                    fill={colour}
                >
                    {item.text}
                </text>
            )
    }
}

// The kWh meter and the main breaker come from the board layout as items made of library symbols (head.items); only the earth is drawn here.
const BoardHead = ({head, selected, onSelect}) => {
    const earthSelected = !!selected && selected === head.groundId,
        colour = earthSelected ? SELECTED_COLOUR : '#000',
        earthClickable = head.groundId && onSelect ? {'data-nid': head.groundId, onClick: () => onSelect(head.groundId), style: {cursor: 'pointer'}} : {}
    return (
        <>
            {head.ground && (
                <g {...earthClickable} stroke={colour} strokeWidth="2" fill="none">
                    <rect x="100" y="0" width="44" height="66" fill="transparent" stroke="none" />
                    <line x1="122" y1="0" x2="122" y2="50" />
                    <line x1="110" y1="20" x2="134" y2="20" />
                    <line x1="110" y1="28" x2="134" y2="28" />
                    <line x1="110" y1="50" x2="134" y2="50" />
                    <line x1="114" y1="56" x2="130" y2="56" />
                    <line x1="118" y1="62" x2="126" y2="62" />
                </g>
            )}
            {head.items.map((item, index) => (
                <DrawnItem key={index} item={item} selected={selected} onSelect={onSelect} />
            ))}
        </>
    )
}

// Width of the head (kWh meter, earth, main differential) in drawing units; it is repeated at the left of every sheet.
const HEAD_WIDTH = 262

/**
 * board = the layout of the page, slice = the part of it on this sheet. In the editor: selected / onSelect (select an element), onDelete
 * (trash can on the selected element), ghost / busHighlighted (drag & drop preview), sheetId (ids of the clickable footer cells).
 */
export function BoardSheet({project, board, slice, number, total, selected, ghost, busHighlighted, onSelect, onFooter, onDelete, sheetId}) {
    const {t} = useTranslation()
    const sliceWidth = Math.max(1, slice.x1 - slice.x0),
        scale = sheetScale(sliceWidth, -slice.minY),
        // around the middle of the page, lower for higher circuits, down to just above the footer (the head below it)
        busY = busPosition(-slice.minY, scale),
        // when the board continues on another sheet the bus runs to the page margin (10..287 mm) so the markers get room
        busLeft = slice.first ? BUS_START_X : slice.x0,
        busRight = slice.last ? slice.x1 : slice.x0 + DRAWING_WIDTH / scale,
        headX = slice.first ? 0 : slice.x0
    return (
        <Sheet project={project} number={number} total={total} onFooter={onFooter} sheetId={sheetId}>
            <g transform={`translate(10,${busY}) scale(${scale}) translate(${-slice.x0},0)`} fontFamily={FONT_FAMILY}>
                <line x1={busLeft} y1="0" x2={busRight} y2="0" stroke={busHighlighted ? SELECTED_COLOUR : '#000'} strokeWidth="5" />
                {/* drop zone along the bus: a circuit that is dropped here becomes the last circuit (only takes the pointer while a symbol is dragged) */}
                {onSelect && board.bus && (
                    <line className="eds-bus" data-bus={board.bus.id} x1={busLeft} y1="0" x2={busRight} y2="0" stroke="transparent" strokeWidth="70" />
                )}
                <g transform={`translate(${headX},0)`}>
                    <BoardHead head={board.head} selected={selected} onSelect={onSelect} />
                </g>
                {board.circuits.slice(slice.from, slice.to).map((circuit) => (
                    <g key={circuit.node.id + '@' + circuit.x} transform={`translate(${circuit.x},0)`}>
                        {circuit.items.map((item, index) => (
                            <DrawnItem
                                key={index}
                                item={item}
                                selected={selected}
                                ghost={ghost}
                                inGhostCircuit={!!ghost && circuit.node.id === ghost}
                                onSelect={onSelect}
                                onDelete={onDelete}
                            />
                        ))}
                    </g>
                ))}
            </g>
            {/* continuation markers in page coordinates (mm): left next to the head, right at the page margin */}
            {!slice.first && (
                <text className="continued-from" x={10 + (HEAD_WIDTH + 8) * scale} y={busY + 4.5} fontSize="3.2" fontFamily={FONT_FAMILY}>
                    {t('sheet.continuedFrom', {number: number - 1})}
                </text>
            )}
            {!slice.last && (
                <text className="continued-on" x="287" y={busY + 4.5} fontSize="3.2" textAnchor="end" fontFamily={FONT_FAMILY}>
                    {t('sheet.continuedOn', {number: number + 1})}
                </text>
            )}
        </Sheet>
    )
}
