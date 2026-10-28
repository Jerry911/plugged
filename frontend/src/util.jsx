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

// The waterproof socket used to be a symbol of its own (stopcontact_h). It is a normal socket with the property h now (p.h on the eendraadschema,
// h on a loose symbol of the situatieschema): projects made with the old symbol are converted when they are opened.
const OLD_WATERPROOF = 'stopcontact_h'
const fixNode = (n) => ({
    ...n,
    ...(n.type === OLD_WATERPROOF ? {type: 'stopcontact', p: {...n.p, h: true}} : {}),
    children: (n.children || []).map(fixNode),
})
export const migrateWaterproof = (d) => ({
    ...d,
    ...(d.een ? {een: d.een.map((g) => ({...g, tree: (g.tree || []).map(fixNode)}))} : {}),
    ...(d.sit ? {sit: d.sit.map((g) => ({...g, items: (g.items || []).map((i) => (i.type === OLD_WATERPROOF ? {...i, type: 'stopcontact', h: true} : i))}))} : {}),
})
// change the properties p of one component (node) of the eendraadschema, wherever it is in the project
const patchNode = (ns, id, patch) => ns.map((n) => (n.id === id ? {...n, p: {...n.p, ...patch}} : {...n, children: patchNode(n.children || [], id, patch)}))
export const setNodeProps = (p, id, patch) => ({...p, een: p.een.map((g) => ({...g, tree: patchNode(g.tree, id, patch)}))})
