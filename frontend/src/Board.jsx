// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {Sym} from './symbols'
import {Sheet} from './Footer'
import {BUSX0, U} from './board'

const B = '#0a6cff'
const Item = ({it, sel, onSel}) => {
    const on = sel && it.id === sel,
        c = on ? B : '#000',
        h = it.id && onSel ? {onClick: () => onSel(it.id), style: {cursor: 'pointer'}} : {}
    if (it.k === 'line') return <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke="#000" strokeWidth="2" />
    if (it.k === 'sym')
        return (
            <g {...h}>
                <rect x={it.x - 30} y={it.y - 30} width="60" height="60" fill="transparent" />
                <Sym shapes={it.shapes} x={it.x} y={it.y} s={it.s} stroke={c} />
            </g>
        )
    if (it.k === 'rect')
        return (
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
const Head = ({h}) => (
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
                {h.main && <line x1="197" y1="0" x2="197" y2="96" />}
                {h.q?.kabel && (
                    <text x="110" y="114" fontSize="13" fill="#000" stroke="none">
                        {h.q.kabel}
                    </text>
                )}
            </>
        )}
        {h.main && (
            <>
                <line x1="197" y1="30" x2="188" y2="52" />
                <rect x="183" y="52" width="7" height="9" fill="#000" />
                {[
                    [h.main === 'differentieel' ? `Δ${h.q.delta || 300}mA` : null, 0],
                    [`${h.q.polen || 2}P - ${h.q.amp || 40}A`, 1],
                    [h.q.diffType ? `Type ${h.q.diffType}` : null, 2],
                ]
                    .filter((a) => a[0])
                    .map(([s, i]) => (
                        <text key={i} transform={`translate(${210 + 13 * i},62) rotate(-90)`} fontSize="13" fill="#000" stroke="none">
                            {s}
                        </text>
                    ))}
            </>
        )}
    </g>
)
export const BoardSheet = ({p, pg, b, sl, no, total, sel, onSel, onFooter}) => {
    const W = Math.max(1, sl.x1 - sl.x0),
        s = Math.min(U, 277 / W, 135 / Math.max(1, -sl.minY)),
        y = Math.min(147, 12 + -sl.minY * s)
    return (
        <Sheet p={p} page={no} total={total} onFooter={onFooter} name={'Eendraadschema – ' + pg.name}>
            <g transform={`translate(10,${y}) scale(${s}) translate(${-sl.x0},0)`} fontFamily="Verdana, DejaVu Sans, sans-serif">
                <line x1={sl.first ? BUSX0 : sl.x0} y1="0" x2={sl.x1} y2="0" stroke="#000" strokeWidth="5" />
                {sl.first && <Head h={b.head} />}
                {!sl.first && (
                    <text x={sl.x0 + 4} y="26" fontSize="13">
                        ← vervolg van blad {no - 1}
                    </text>
                )}
                {!sl.last && (
                    <text x={sl.x1 - 4} y="26" fontSize="13" textAnchor="end">
                        vervolg op blad {no + 1} →
                    </text>
                )}
                {b.circuits.slice(sl.from, sl.to).map((c) => (
                    <g key={c.n.id} transform={`translate(${c.x},0)`}>
                        {c.items.map((it, i) => (
                            <Item key={i} it={it} sel={sel} onSel={onSel} />
                        ))}
                    </g>
                ))}
            </g>
        </Sheet>
    )
}
