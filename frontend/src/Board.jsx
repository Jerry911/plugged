// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {Sym} from './symbols'
import {Sheet} from './Footer'
import {breakerLever, BUSX0, U} from './boardModel.jsx'

const B = '#0a6cff'
// small trash can in the top right corner of the selected element (only when the sheet is given an onDelete handler)
const Trash = ({x, y, onDelete}) => (
    <g
        id="eds-drawing-delete"
        style={{cursor: 'pointer'}}
        onClick={(e) => {
            e.stopPropagation()
            onDelete()
        }}
    >
        <title>Verwijderen</title>
        <circle cx={x} cy={y} r="10" fill="#fff" stroke="#c0392b" strokeWidth="1.5" />
        <g transform={`translate(${x},${y}) scale(0.62) translate(-12,-12)`} fill="none" stroke="#c0392b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </g>
    </g>
)
// symbols are drawn in a 24-unit box scaled by s/24: compensate so their stroke equals the connection lines
const LINE_W = 2
const Item = ({it, sel, onSel, onDelete}) => {
    const on = sel && it.id === sel,
        c = on ? B : '#000',
        h = {...(it.id ? {'data-nid': it.id} : {}), ...(it.id && onSel ? {onClick: () => onSel(it.id), style: {cursor: 'pointer'}} : {})}
    if (it.k === 'line') return <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke="#000" strokeWidth={it.w || LINE_W} />
    if (it.k === 'poly') return <polygon points={it.pts.map((q) => q.join(',')).join(' ')} fill="#000" stroke="#000" strokeWidth="1" strokeLinejoin="round" />
    if (it.k === 'sym')
        return (
            <>
                <g {...h}>
                    <rect x={it.x - 30} y={it.y - 30} width="60" height="60" fill="transparent" />
                    {it.r ? (
                        <g transform={`rotate(${it.r} ${it.x} ${it.y})`}>
                            <Sym shapes={it.shapes} x={it.x} y={it.y} s={it.s} stroke={c} w={(LINE_W * 24) / it.s} />
                        </g>
                    ) : (
                        <Sym shapes={it.shapes} x={it.x} y={it.y} s={it.s} stroke={c} w={(LINE_W * 24) / it.s} />
                    )}
                </g>
                {on && onDelete && <Trash x={it.x + 30} y={it.y - 30} onDelete={onDelete} />}
            </>
        )
    if (it.k === 'rect')
        return (
            <>
                <rect
                    {...h}
                    x={it.x}
                    y={it.y}
                    width={it.w}
                    height={it.h}
                    fill={it.fill ? '#000' : '#fff'}
                    stroke={c}
                    strokeWidth={it.id ? 3 : 1.5}
                />
                {on && onDelete && <Trash x={it.x + it.w} y={it.y} onDelete={onDelete} />}
            </>
        )
    return (
        <text
            {...h}
            transform={it.rot ? `translate(${it.x},${it.y}) rotate(-90)` : undefined}
            x={it.rot ? 0 : it.x}
            y={it.rot ? 0 : it.y}
            fontSize={it.size || 13}
            fontWeight={it.bold ? 700 : 400}
            fontStyle={it.italic ? 'italic' : 'normal'}
            textAnchor={it.anchor || 'start'}
            fill={c}
        >
            {it.s}
        </text>
    )
}
const Head = ({h}) => {
    const br = breakerLever(197, 66)
    return (
        <g stroke="#000" strokeWidth="2" fill="none">
            {h.ground && (
                <>
                    <line x1="122" y1="0" x2="122" y2="50" />
                    <line x1="110" y1="20" x2="134" y2="20" />
                    <line x1="110" y1="28" x2="134" y2="28" />
                    <line x1="110" y1="50" x2="134" y2="50" />
                    <line x1="114" y1="56" x2="130" y2="56" />
                    <line x1="118" y1="62" x2="126" y2="62" />
                </>
            )}
            {h.kwh && (
                <>
                    <line x1="10" y1="96" x2="35" y2="96" />
                    <rect x="35" y="70" width="50" height="50" strokeWidth="3" />
                    <line x1="35" y1="82" x2="85" y2="82" />
                    <text x="60" y="108" fontSize="15" fontWeight="700" textAnchor="middle" fill="#000" stroke="none">
                        kWh
                    </text>
                    <line x1="85" y1="96" x2={h.main ? 197 : 130} y2="96" />
                    {h.main && <line x1="197" y1="96" x2="197" y2="66" />}
                    {h.q?.kabel && (
                        <text x="110" y="114" fontSize="13" fill="#000" stroke="none">
                            {h.q.kabel}
                        </text>
                    )}
                </>
            )}
            {h.main && (
                <>
                    {/* the supply comes from the meter below: the line stops at the lower contact (y 66), the lever swings up and to the
                    left (towards the busbar) and ends in a filled block, the line carries on above the lever up to the busbar */}
                    <line x1="197" y1="66" x2={br.lever.x2} y2={br.lever.y2} />
                    <polygon points={br.block.pts.map((q) => q.join(',')).join(' ')} fill="#000" strokeLinejoin="round" />
                    <line x1="197" y1="0" x2="197" y2={br.tipY} />
                    {[
                        [h.main === 'differentieel' ? `Δ${h.q.delta || 300}mA` : null, 0],
                        [`${h.q.polen || 2}P - ${h.q.amp || 40}A`, 1],
                        [h.q.diffType ? `Type ${h.q.diffType}` : null, 2],
                    ]
                        .filter((a) => a[0])
                        .map(([s, i]) => (
                            <text key={i} transform={`translate(${210 + 13 * i},66) rotate(-90)`} fontSize="13" fill="#000" stroke="none">
                                {s}
                            </text>
                        ))}
                </>
            )}
        </g>
    )
}
// Width of the head (kWh meter, earth, main differential) in drawing units; it is repeated at the left of every sheet.
const HEADW = 262
export const BoardSheet = ({p, pg, b, sl, no, total, sel, onSel, onFooter, onDelete}) => {
    const W = Math.max(1, sl.x1 - sl.x0),
        s = Math.min(U, 277 / W, 135 / Math.max(1, -sl.minY)),
        y = Math.min(147, 12 + -sl.minY * s),
        // when the board continues on another sheet the bus runs to the page margin (10..287 mm) so the markers get room
        left = sl.first ? BUSX0 : sl.x0,
        right = sl.last ? sl.x1 : sl.x0 + 277 / s,
        hx = sl.first ? 0 : sl.x0
    return (
        <Sheet p={p} page={no} total={total} onFooter={onFooter} name={'Eendraadschema – ' + pg.name}>
            <g transform={`translate(10,${y}) scale(${s}) translate(${-sl.x0},0)`} fontFamily="Verdana, DejaVu Sans, sans-serif">
                <line x1={left} y1="0" x2={right} y2="0" stroke="#000" strokeWidth="5" />
                <g transform={`translate(${hx},0)`}>
                    <Head h={b.head} />
                </g>
                {b.circuits.slice(sl.from, sl.to).map((c) => (
                    <g key={c.n.id} transform={`translate(${c.x},0)`}>
                        {c.items.map((it, i) => (
                            <Item key={i} it={it} sel={sel} onSel={onSel} onDelete={onDelete} />
                        ))}
                    </g>
                ))}
            </g>
            {/* continuation markers in page coordinates (mm): left next to the head, right at the page margin */}
            {!sl.first && (
                <text x={10 + (HEADW + 8) * s} y={y + 4.5} fontSize="3.2" fontFamily="Verdana, DejaVu Sans, sans-serif">
                    ← vervolg van blad {no - 1}
                </text>
            )}
            {!sl.last && (
                <text x="287" y={y + 4.5} fontSize="3.2" textAnchor="end" fontFamily="Verdana, DejaVu Sans, sans-serif">
                    vervolg op blad {no + 1} →
                </text>
            )}
        </Sheet>
    )
}
