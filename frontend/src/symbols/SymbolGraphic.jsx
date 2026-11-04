// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {arcPath, round2} from './symbolShapes.js'

const DEFAULT_FONT_SIZE = 10

/**
 * Draws the shapes of a symbol (24x24 grid) centred on (x, y) at a size of `size` units.
 * rotation: the rotation (degrees) the parent applies to the symbol; texts in the symbol (the h of a waterproof socket) are turned back so
 * that they stay upright and readable.
 */
export default function SymbolGraphic({shapes, x = 0, y = 0, size = 8, stroke = '#000', strokeWidth = 1.5, rotation = 0}) {
    // the colour a shape is filled with: f 1 = the colour of the drawing, f 2 = the paper (it hides what lies behind it)
    const fillOf = (shape) => (shape.f === 2 ? {fill: '#fff'} : shape.f ? {fill: stroke} : {}),
        // the line weight of a shape is relative to the one of the drawing
        weightOf = (shape) => (shape.sw ? {strokeWidth: round2(strokeWidth * shape.sw)} : {})
    return (
        <g
            transform={`translate(${x - size / 2},${y - size / 2}) scale(${size / 24})`}
            stroke={stroke}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {shapes.map((shape, index) => {
                switch (shape.t) {
                    case 'line':
                        return <line key={index} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...weightOf(shape)} />
                    case 'circle':
                        return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} {...fillOf(shape)} {...weightOf(shape)} />
                    case 'rect':
                        return <rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} {...fillOf(shape)} {...weightOf(shape)} />
                    case 'arc':
                        return <path key={index} d={arcPath(shape)} {...weightOf(shape)} />
                    case 'path':
                        return <path key={index} d={shape.d} {...fillOf(shape)} {...weightOf(shape)} />
                    default: {
                        const fontSize = shape.fs || DEFAULT_FONT_SIZE
                        return (
                            <text
                                key={index}
                                x={shape.x}
                                y={shape.y}
                                fontSize={fontSize}
                                fontWeight={shape.b ? 'bold' : undefined}
                                textAnchor="middle"
                                fill={stroke}
                                stroke="none"
                                transform={rotation % 360 ? `rotate(${-rotation} ${shape.x} ${round2(shape.y - fontSize * 0.35)})` : undefined}
                            >
                                {shape.s}
                            </text>
                        )
                    }
                }
            })}
        </g>
    )
}
