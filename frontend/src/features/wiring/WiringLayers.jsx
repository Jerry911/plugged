// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// What a page of the bedradingsschema has on top of a plan: the rectangles (boxes), the wires with their junction dots and, in the editor, the
// connection points of the symbols, the wire being drawn and the handles of the selected wire.
import {colourOf, dashArray, EARTH_YELLOW, junctions, lengthOf, pathOf, wirePoints} from '../../model/wiring.js'
import {formatLength} from '../../model/geometry.js'

const SELECTION_COLOUR = '#0a6cff'

/** A line in a wire style: solid, dashed, dotted or dash-dot, in a colour (yellow-green: green with yellow dashes). */
export function StyledPath({d, style, color, w = 0.35, ...rest}) {
    const width = w || 0.35,
        dashes = dashArray(style, width),
        stroke = colourOf(color)
    return (
        <>
            <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={width}
                strokeDasharray={dashes}
                strokeLinecap={style === 'dotted' ? 'round' : 'butt'}
                strokeLinejoin="round"
                {...rest}
            />
            {color === 'yellowgreen' && !dashes && (
                <path d={d} fill="none" stroke={EARTH_YELLOW} strokeWidth={width} strokeDasharray={`${width * 4} ${width * 4}`} pointerEvents="none" />
            )}
        </>
    )
}

const boxPath = (box) => `M${box.x1} ${box.y1}H${box.x2}V${box.y2}H${box.x1}Z`

/** The rectangles of a page (behind the symbols). */
export function BoxesLayer({boxes, editor, prefix, isSelected, interaction}) {
    return boxes.map((box) => (
        <g key={box.id}>
            <StyledPath d={boxPath(box)} style={box.style} color={box.color} w={box.w} />
            {isSelected(box.id) && <path d={boxPath(box)} fill="none" stroke={SELECTION_COLOUR} strokeWidth="1.6" opacity=".35" pointerEvents="none" />}
            {editor && (
                <path id={`${prefix}-box-${box.id}`} {...interaction('box', box.id, 'm')} d={boxPath(box)} fill="none" stroke="transparent" strokeWidth="4" />
            )}
            {isSelected(box.id) &&
                editor.selection.length === 1 &&
                [
                    ['a', box.x1, box.y1],
                    ['b', box.x2, box.y2],
                ].map(([end, x, y]) => (
                    <circle
                        key={end}
                        id={`${prefix}-box-${box.id}-${end}`}
                        {...interaction('box', box.id, end)}
                        cx={x}
                        cy={y}
                        r="1.8"
                        fill={SELECTION_COLOUR}
                    />
                ))}
        </g>
    ))
}

/** Where the length of a wire is written: next to the middle of its longest leg. */
const wireLabel = (points, scale) => {
    let best = null
    points.forEach((point, index) => {
        if (!index) return
        const previous = points[index - 1],
            length = Math.hypot(point.x - previous.x, point.y - previous.y)
        if (!best || length > best.length) best = {length, from: previous, to: point}
    })
    if (!best || best.length < 6) return null
    const horizontal = Math.abs(best.to.x - best.from.x) >= Math.abs(best.to.y - best.from.y)
    return {
        x: (best.from.x + best.to.x) / 2 + (horizontal ? 0 : 2),
        y: (best.from.y + best.to.y) / 2 + (horizontal ? -1.5 : 0),
        rotate: horizontal ? 0 : 90,
        text: formatLength(lengthOf(points), scale),
    }
}

/**
 * The wires of a page. resolve(end) = where a wire end is on the sheet. In the editor: the connection points of the symbols (editor.pins), the
 * handles of a selected wire (its ends and bends can be dragged) and the wire being drawn (editor.wirePreview: its points).
 */
export function WiresLayer({wires, resolve, editor, prefix, isSelected, interaction, showLengths, scale}) {
    const drawn = wires.map((wire) => ({wire, points: wirePoints(wire, resolve)})).filter((entry) => entry.points.length > 1)
    return (
        <>
            {drawn.map(({wire, points}) => {
                const d = pathOf(points),
                    selected = isSelected(wire.id),
                    label = showLengths && wireLabel(points, scale)
                return (
                    <g key={wire.id} className="wire" data-wire={wire.id}>
                        <StyledPath d={d} style={wire.style} color={wire.color} w={wire.w} />
                        {selected && (
                            <path d={d} fill="none" stroke={SELECTION_COLOUR} strokeWidth={(wire.w || 0.35) + 1.4} opacity=".35" pointerEvents="none" />
                        )}
                        {editor && (
                            <path
                                id={`${prefix}-wire-${wire.id}`}
                                {...interaction('wire', wire.id, 'm')}
                                d={d}
                                fill="none"
                                stroke="transparent"
                                strokeWidth="3"
                            />
                        )}
                        {label && (
                            <text
                                className="length-label"
                                x={label.x}
                                y={label.y}
                                fontSize="2.2"
                                textAnchor="middle"
                                fill={colourOf(wire.color)}
                                transform={label.rotate ? `rotate(${label.rotate} ${label.x} ${label.y})` : undefined}
                                pointerEvents="none"
                            >
                                {label.text}
                            </text>
                        )}
                        {selected &&
                            editor.selection.length === 1 &&
                            [['a', resolve(wire.a)], ...(wire.points || []).map((point, index) => ['p' + index, point]), ['b', resolve(wire.b)]].map(
                                ([part, point]) => (
                                    <circle
                                        key={part}
                                        id={`${prefix}-wire-${wire.id}-${part}`}
                                        {...interaction('wire', wire.id, part)}
                                        cx={point.x}
                                        cy={point.y}
                                        r={part.startsWith('p') ? 1.3 : 1.7}
                                        fill={part.startsWith('p') ? '#fff' : SELECTION_COLOUR}
                                        stroke={SELECTION_COLOUR}
                                        strokeWidth=".4"
                                    />
                                ),
                            )}
                    </g>
                )
            })}
            {junctions(wires, resolve).map((dot) => (
                <circle key={`${dot.x},${dot.y}`} className="junction" cx={dot.x} cy={dot.y} r="0.9" fill="#000" pointerEvents="none" />
            ))}
            {editor?.pins && (
                <g id={`${prefix}-pins`} pointerEvents="none">
                    {editor.pins.map((pin) => (
                        <circle
                            key={`${pin.item}:${pin.pin}`}
                            className={'pin' + (pin.active ? ' active' : '')}
                            cx={pin.x}
                            cy={pin.y}
                            r={pin.active ? 1.3 : 0.8}
                            fill={pin.active ? SELECTION_COLOUR : '#fff'}
                            stroke={SELECTION_COLOUR}
                            strokeWidth=".3"
                        />
                    ))}
                </g>
            )}
            {editor?.wirePreview && editor.wirePreview.points.length > 1 && (
                <g pointerEvents="none" opacity=".8">
                    <StyledPath
                        d={pathOf(editor.wirePreview.points)}
                        style={editor.wirePreview.style}
                        color={editor.wirePreview.color}
                        w={editor.wirePreview.w}
                    />
                    <path d={pathOf(editor.wirePreview.points)} fill="none" stroke={SELECTION_COLOUR} strokeWidth=".25" strokeDasharray="1 1" />
                    <circle cx={editor.wirePreview.points[0].x} cy={editor.wirePreview.points[0].y} r="0.9" fill="red" />
                </g>
            )}
            {editor?.boxPreview && (
                <rect
                    pointerEvents="none"
                    x={Math.min(editor.boxPreview.from.x, editor.boxPreview.to.x)}
                    y={Math.min(editor.boxPreview.from.y, editor.boxPreview.to.y)}
                    width={Math.abs(editor.boxPreview.to.x - editor.boxPreview.from.x)}
                    height={Math.abs(editor.boxPreview.to.y - editor.boxPreview.from.y)}
                    fill="none"
                    stroke={SELECTION_COLOUR}
                    strokeWidth=".5"
                    strokeDasharray="1.5 1"
                />
            )}
        </>
    )
}
