// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Inserting an element before / after another one in the eendraadschema tree (buttons in Eigenschappen, drag & drop from the palette).
// Pure functions: the symbol types come in as plain objects {k, parents, ...}, so they can be tested without React.
//
// after  = the new element hangs under the target, as its last child (the same as clicking a symbol in the palette)
// before = the new element takes the place of the target and the target hangs under it: parent -> new -> target
// `t.parents` is the "can be placed after" list of a symbol type: the types it may hang directly under.

// type of the empty element that is created by the "insert before / after" buttons; the Type dropdown turns it into a real symbol
export const EMPTY = 'leeg'

// may a symbol of type `t` hang directly under an element of type `pk`? (a circuit can never hang under a circuit)
export const okUnder = (t, pk, free = false) => !(t.k === 'kring' && pk === 'kring') && (free || (t.parents || []).includes(pk))

// the element that holds `id` (null for a top level element, undefined when the id is not in the tree)
export const parentOf = (ns, id, par = null) => {
    for (const n of ns) {
        if (n.id === id) return par
        const r = parentOf(n.children, id, n)
        if (r !== undefined) return r
    }
}
const upd = (ns, id, f) => ns.flatMap((n) => (n.id === id ? f(n) : [{...n, children: upd(n.children, id, f)}]))

export const addAfter = (tree, id, n) => upd(tree, id, (x) => [{...x, children: [...x.children, n]}])
export const addBefore = (tree, id, n) => upd(tree, id, (x) => [{...n, children: [x]}])
export const insertAt = (tree, id, mode, n) => (mode === 'before' ? addBefore(tree, id, n) : addAfter(tree, id, n))
// A sibling = the next branch: the new element hangs under the same parent as `id`, directly after it (in the drawing the next branch above it,
// e.g. B1 -> B2; the numbers of the branches that follow shift up by one).
export const addSibling = (tree, id, n) => {
    const i = tree.findIndex((x) => x.id === id)
    return i >= 0 ? [...tree.slice(0, i + 1), n, ...tree.slice(i + 1)] : tree.map((x) => ({...x, children: addSibling(x.children, id, n)}))
}

// Can a symbol type be inserted before / after the element `s`? `typeOf(k)` gives the type object of a type key.
export const canInsert = (typeOf, tree, s, mode, t, free = false) => {
    if (mode === 'after') return okUnder(t, s.type, free) && (t.parents || []).length > 0
    const par = parentOf(tree, s.id)
    if (par === undefined) return false
    const upOk = par ? okUnder(t, par.type, free) : free || !(t.parents || []).length
    return upOk && okUnder(typeOf(s.type), t.k, free)
}
// the types that can be inserted before / after `s`
export const insertTypes = (typeOf, tree, T, s, mode, free = false) => T.filter((t) => canInsert(typeOf, tree, s, mode, t, free))

// Can a symbol type become the next branch (sibling) of the element `s`? It must fit under the parent of `s`, like `s` itself does.
export const canSibling = (tree, s, t, free = false) => {
    const par = parentOf(tree, s.id)
    if (par === undefined) return false
    return par ? okUnder(t, par.type, free) : free || !(t.parents || []).length
}
export const siblingTypes = (tree, T, s, free = false) => T.filter((t) => canSibling(tree, s, t, free))

// The types an EMPTY element can become: it must fit under its parent and everything that hangs under it must fit under the new type
export const emptyChoices = (typeOf, tree, T, n, free = false) => {
    const par = parentOf(tree, n.id)
    return T.filter(
        (t) =>
            (par ? okUnder(t, par.type, free) : free || !(t.parents || []).length) &&
            n.children.every((c) => okUnder(typeOf(c.type), t.k, free)),
    )
}
