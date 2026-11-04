// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Pure operations on the element tree of an eendraadschema page: a list of nodes {id, type, label, info, p, r, children}.
// Every operation returns a new tree and leaves the given one untouched.

/** A short random id for a new node, wall or item. */
export const newId = () => Math.random().toString(36).slice(2, 9)

/** All nodes of a tree, depth first (a node before its children). */
export const flatten = (nodes) => (nodes || []).flatMap((node) => [node, ...flatten(node.children)])

/** A copy of the nodes with fresh ids everywhere (to duplicate a part of the tree). */
export const withNewIds = (nodes) => nodes.map((node) => ({...node, id: newId(), children: withNewIds(node.children)}))

/** The node with this id, anywhere in the tree (undefined when it is not there). */
export const findNode = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
    }
}

/** Replaces the node `id` by the list of nodes `replace(node)` returns (an empty list removes it). */
export const replaceNode = (nodes, id, replace) =>
    nodes.flatMap((node) => (node.id === id ? replace(node) : [{...node, children: replaceNode(node.children, id, replace)}]))

/** Changes the node `id` with `change(node)` (which returns the new node). */
export const updateNode = (nodes, id, change) => replaceNode(nodes, id, (node) => [change(node)])

/** Removes the node `id` with everything under it. */
export const removeNode = (nodes, id) => replaceNode(nodes, id, () => [])

/** Moves the node `id` `offset` places among its siblings (-1 = earlier, 1 = later); nothing happens at the start or end of the list. */
export const moveNode = (nodes, id, offset) => {
    const index = nodes.findIndex((node) => node.id === id)
    if (index < 0) return nodes.map((node) => ({...node, children: moveNode(node.children, id, offset)}))
    const target = index + offset
    if (target < 0 || target >= nodes.length) return nodes
    const moved = [...nodes]
    ;[moved[index], moved[target]] = [moved[target], moved[index]]
    return moved
}

/** One level down: the node `id` becomes the last child of its previous sibling (the first child of a list stays where it is). */
export const indentNode = (nodes, id) => {
    const index = nodes.findIndex((node) => node.id === id)
    if (index < 0) return nodes.map((node) => ({...node, children: indentNode(node.children, id)}))
    if (index === 0) return nodes
    const result = [...nodes],
        [moving] = result.splice(index, 1)
    result[index - 1] = {...result[index - 1], children: [...result[index - 1].children, moving]}
    return result
}

/** One level up: the node `id` leaves its parent and comes directly after it. */
export const outdentNode = (nodes, id) =>
    nodes.flatMap((node) => {
        const child = node.children.find((candidate) => candidate.id === id)
        return child
            ? [{...node, children: node.children.filter((candidate) => candidate !== child)}, child]
            : [{...node, children: outdentNode(node.children, id)}]
    })

/** Rotation step (degrees) of the turn buttons; an element can be turned a full 360 degrees in both directions. */
export const ROTATION_STEP = 15

/** Turns the symbol of node `id` by `degrees` (the result stays within 0..359). */
export const rotateNode = (nodes, id, degrees) => updateNode(nodes, id, (node) => ({...node, r: ((((node.r || 0) + degrees) % 360) + 360) % 360}))

/** The ids of the ancestors of node `id`, from the top down (undefined when the id is not in the tree). */
export const ancestorIdsOf = (nodes, id, ancestors = []) => {
    for (const node of nodes) {
        if (node.id === id) return ancestors
        const found = ancestorIdsOf(node.children, id, [...ancestors, node.id])
        if (found) return found
    }
}
