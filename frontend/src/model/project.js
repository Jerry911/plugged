// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Helpers on a whole project document: {name, footer, een: [eendraad pages], sit: [situatieschema pages], hidden, custom}.
// The keys of the document are those of the stored projects and exported files: they stay Dutch so older files keep opening.
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {flatten} from './tree.js'

/** The name an element is shown with: its own label, else the name of its symbol. */
export const nodeName = (project, node) => node.label || symbolName(typeOf(project, node.type))

/** All elements of the eendraadschema that belong on the situatieschema (their symbol is placeable). */
export const placeableNodes = (project) =>
    project.een.flatMap((page) => flatten(page.tree)).filter((node) => typeOf(project, node.type).place)

const placedNodeIds = (project) =>
    new Set(
        project.sit
            .flatMap((page) => page.items)
            .filter((item) => item.kind === 'sym')
            .map((item) => item.node),
    )

/** The placeable elements that are on no situatieschema page and that the user did not hide. */
export const unplacedNodes = (project) => {
    const placed = placedNodeIds(project),
        hidden = new Set(project.hidden || [])
    return placeableNodes(project).filter((node) => !placed.has(node.id) && !hidden.has(node.id))
}

/** The elements the user marked as not needed on the situatieschema (stored in the project, so it is saved with it). */
export const hiddenNodes = (project) => {
    const hidden = new Set(project.hidden || [])
    return placeableNodes(project).filter((node) => hidden.has(node.id))
}

/**
 * The marking of every element under a circuit, e.g. 'A7' = circuit A, point 7. Same numbering as drawn on the eendraadschema (the point's
 * own nr, else its position under the circuit). Everything hanging under a point (a switch and its lamp) shares its marking.
 */
export const circuitMarks = (project) => {
    const marks = new Map(),
        walk = (nodes, mark) =>
            nodes.forEach((node) => {
                if (mark) marks.set(node.id, mark)
                if (node.type === 'kring')
                    node.children.forEach((child, index) => walk([child], node.label ? node.label + (child.p?.nr || index + 1) : null))
                else walk(node.children, mark)
            })
    project.een.forEach((page) => walk(page.tree, null))
    return marks
}

// The waterproof socket used to be a symbol of its own (stopcontact_h). It is a normal socket with the property h now (p.h on the eendraadschema,
// h on a loose symbol of the situatieschema): projects made with the old symbol are converted when they are opened.
const OLD_WATERPROOF_TYPE = 'stopcontact_h'
const convertWaterproofNode = (node) => ({
    ...node,
    ...(node.type === OLD_WATERPROOF_TYPE ? {type: 'stopcontact', p: {...node.p, h: true}} : {}),
    children: (node.children || []).map(convertWaterproofNode),
})
export const migrateWaterproof = (project) => ({
    ...project,
    ...(project.een ? {een: project.een.map((page) => ({...page, tree: (page.tree || []).map(convertWaterproofNode)}))} : {}),
    ...(project.sit
        ? {
              sit: project.sit.map((page) => ({
                  ...page,
                  items: (page.items || []).map((item) => (item.type === OLD_WATERPROOF_TYPE ? {...item, type: 'stopcontact', h: true} : item)),
              })),
          }
        : {}),
})

// change the properties p of one element of the eendraadschema, wherever it is in the project
const patchNodeProperties = (nodes, id, patch) =>
    nodes.map((node) => (node.id === id ? {...node, p: {...node.p, ...patch}} : {...node, children: patchNodeProperties(node.children || [], id, patch)}))

/** The project with the properties of element `id` changed by `patch`. */
export const setNodeProperties = (project, id, patch) => ({
    ...project,
    een: project.een.map((page) => ({...page, tree: patchNodeProperties(page.tree, id, patch)})),
})
