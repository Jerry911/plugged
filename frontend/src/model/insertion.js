// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Inserting an element before / after another one in the eendraadschema tree (buttons in Eigenschappen, drag & drop from the palette).
// Pure functions: the symbol types come in as plain objects {k, parents, ...}, so they can be tested without React.
//
// after  = the new element hangs under the target, as its last child (the same as clicking a symbol in the palette)
// before = the new element takes the place of the target and the target hangs under it: parent -> new -> target
// `symbolType.parents` is the "can be placed after" list of a symbol type: the types it may hang directly under.
// `free` = free hierarchy: everything may hang under everything (except a circuit under a circuit).
import {findNode, replaceNode} from './tree.js'

/** Type of the empty element that is created by the "insert before / after" buttons; the Type dropdown turns it into a real symbol. */
export const EMPTY = 'leeg'

/** May a symbol of type `symbolType` hang directly under an element of type `parentKey`? (a circuit can never hang under a circuit) */
export const canHangUnder = (symbolType, parentKey, free = false) =>
    !(symbolType.k === 'kring' && parentKey === 'kring') && (free || (symbolType.parents || []).includes(parentKey))

/** May the symbol type stand at the top of the tree (no parent)? */
const canBeRoot = (symbolType, free) => free || !(symbolType.parents || []).length

/** The element that holds `id` (null for a top level element, undefined when the id is not in the tree). */
export const parentOf = (nodes, id, parent = null) => {
    for (const node of nodes) {
        if (node.id === id) return parent
        const found = parentOf(node.children, id, node)
        if (found !== undefined) return found
    }
}

export const addAfter = (tree, id, newNode) => replaceNode(tree, id, (target) => [{...target, children: [...target.children, newNode]}])
export const addBefore = (tree, id, newNode) => replaceNode(tree, id, (target) => [{...newNode, children: [target]}])

/**
 * A sibling = the next branch: the new element hangs under the same parent as `id`, directly after it (in the drawing the next branch
 * above it, e.g. B1 -> B2; the numbers of the branches that follow shift up by one).
 */
export const addSibling = (tree, id, newNode) => {
    const index = tree.findIndex((node) => node.id === id)
    return index >= 0
        ? [...tree.slice(0, index + 1), newNode, ...tree.slice(index + 1)]
        : tree.map((node) => ({...node, children: addSibling(node.children, id, newNode)}))
}

/** The new element hangs under the same parent as `id`, directly before it. */
export const addSiblingBefore = (tree, id, newNode) => {
    const index = tree.findIndex((node) => node.id === id)
    return index >= 0
        ? [...tree.slice(0, index), newNode, ...tree.slice(index)]
        : tree.map((node) => ({...node, children: addSiblingBefore(node.children, id, newNode)}))
}

/**
 * Inserts `newNode` relative to the element `id`: 'before' / 'after' (see above), 'root' = a new top level element (an empty drawing),
 * 'left' / 'right' = a new circuit next to the circuit `id` (same parent, before / after it in the tree = left / right in the drawing).
 */
export const insertAt = (tree, id, mode, newNode) => {
    switch (mode) {
        case 'root':
            return [...tree, newNode]
        case 'before':
            return addBefore(tree, id, newNode)
        case 'left':
            return addSiblingBefore(tree, id, newNode)
        case 'right':
            return addSibling(tree, id, newNode)
        default:
            return addAfter(tree, id, newNode)
    }
}

/** The circuit (type 'kring') that holds `id`: the element itself or its nearest ancestor that is one; null when it is not inside a circuit. */
export const circuitOf = (tree, id) => {
    for (let node = findNode(tree, id); node; node = parentOf(tree, node.id)) if (node.type === 'kring') return node
    return null
}

/** Can a symbol type be inserted before / after the element `target`? `typeOf(key)` gives the type object of a type key. */
export const canInsert = (typeOf, tree, target, mode, symbolType, free = false) => {
    if (mode === 'after') return canHangUnder(symbolType, target.type, free) && (symbolType.parents || []).length > 0
    const parent = parentOf(tree, target.id)
    if (parent === undefined) return false
    const fitsUnderParent = parent ? canHangUnder(symbolType, parent.type, free) : canBeRoot(symbolType, free)
    return fitsUnderParent && canHangUnder(typeOf(target.type), symbolType.k, free)
}

/** The types that can be inserted before / after `target`. */
export const insertTypes = (typeOf, tree, symbolTypes, target, mode, free = false) =>
    symbolTypes.filter((symbolType) => canInsert(typeOf, tree, target, mode, symbolType, free))

/** Can a symbol type become the next branch (sibling) of the element `target`? It must fit under the parent of `target`, like `target` itself. */
export const canAddSibling = (tree, target, symbolType, free = false) => {
    const parent = parentOf(tree, target.id)
    if (parent === undefined) return false
    return parent ? canHangUnder(symbolType, parent.type, free) : canBeRoot(symbolType, free)
}
export const siblingTypes = (tree, symbolTypes, target, free = false) => symbolTypes.filter((symbolType) => canAddSibling(tree, target, symbolType, free))

/** The types an EMPTY element can become: it must fit under its parent and everything that hangs under it must fit under the new type. */
export const emptyChoices = (typeOf, tree, symbolTypes, emptyNode, free = false) => {
    const parent = parentOf(tree, emptyNode.id)
    return symbolTypes.filter(
        (symbolType) =>
            (parent ? canHangUnder(symbolType, parent.type, free) : canBeRoot(symbolType, free)) &&
            emptyNode.children.every((child) => canHangUnder(typeOf(child.type), symbolType.k, free)),
    )
}
