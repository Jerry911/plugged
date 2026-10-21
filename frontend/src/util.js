// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {typeOf} from './symbols'

export const nameOf = (p, n) => n.label || typeOf(p, n.type).name
export const uid = () => Math.random().toString(36).slice(2, 9)
export const flat = (ns) => ns.flatMap((n) => [n, ...flat(n.children)])
export const reid = (ns) => ns.map((n) => ({...n, id: uid(), children: reid(n.children)}))
export const allNodes = (p) => p.een.flatMap((g) => flat(g.tree)).filter((n) => typeOf(p, n.type).place)
export const unplacedOf = (p) => {
    const s = new Set(
        p.sit
            .flatMap((g) => g.items)
            .filter((i) => i.kind === 'sym')
            .map((i) => i.node),
    )
    const hid = new Set(p.hidden || [])
    return allNodes(p).filter((n) => !s.has(n.id) && !hid.has(n.id))
}
// components the user marked as not needed on the situatieschema (stored in the project, so it is saved with it)
export const hiddenOf = (p) => {
    const hid = new Set(p.hidden || [])
    return allNodes(p).filter((n) => hid.has(n.id))
}
// Marking of every element under a circuit, e.g. 'A7' = circuit A, point 7. Same numbering as drawn on the eendraadschema
// (the point's own nr, else its position under the circuit). Everything hanging under a point (a switch and its lamp) shares its marking.
export const marksOf = (p) => {
    const out = new Map(),
        walk = (ns, mark) =>
            ns.forEach((n) => {
                if (mark) out.set(n.id, mark)
                if (n.type === 'kring')
                    n.children.forEach((c, i) => walk([c], n.label ? n.label + (c.p?.nr || i + 1) : null))
                else walk(n.children, mark)
            })
    p.een.forEach((g) => walk(g.tree, null))
    return out
}