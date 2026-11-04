// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The lookup in the active symbol library. The symbols themselves (standard ones, edited ones and the user's own) live in the backend
// (GET /api/symbols, see api/useSymbolLibrary.js): that is where the standard drawings are defined and where they are restored from.
import {t, translation} from '../i18n/translate.js'
import {shapeBuilders} from './symbolShapes.js'

const {line, text} = shapeBuilders

// A symbol that is not in the library (anymore, e.g. deleted): a box with a question mark.
const UNKNOWN_TYPE = {
    k: '?',
    name: 'Onbekend symbool',
    cat: 'Overig',
    parents: [],
    place: false,
    shapes: [{t: 'rect', x: 2, y: 6, w: 20, h: 12}, text(12, 15, '?')],
}
// The empty element made by the "insert before / after" buttons: a box that is replaced by a real symbol with the Type dropdown.
// It is not in the library (so it is not in the palette) and is not placed on the situatieschema.
export const EMPTY_TYPE = {
    k: 'leeg',
    name: 'Leeg symbool',
    cat: 'Overig',
    parents: [],
    place: false,
    shapes: [line(1, 12, 5, 12), {t: 'rect', x: 5, y: 6, w: 14, h: 12, sw: 0.6}, line(19, 12, 23, 12), text(12, 15, '?', 8)],
}
// The root of an eendraadschema (the connection to the grid). It has no symbol of its own in the library: on the board it is drawn as the kWh
// meter and the main breaker/differential. It is still a type of the tree, and the parts that may hang directly under it are listed here.
export const CONNECTION_TYPE = {
    k: 'aansluiting',
    name: 'Aansluiting net',
    cat: 'Verdeling',
    parents: [],
    place: false,
    shapes: [{t: 'rect', x: 4, y: 6, w: 16, h: 12}, line(4, 6, 20, 18), line(4, 18, 20, 6)],
}
export const UNDER_CONNECTION = ['teller', 'hoofdschakelaar', 'bord', 'diff', 'aarding']
/** Default category of a symbol of the user (the backend uses the same). */
export const OWN_CATEGORY = 'Eigen'

let activeLibrary = [],
    libraryIndex = new Map()

/** Makes `symbols` (standard symbols + the user's edited and own ones, as delivered by the backend) the active library. */
export const setLibrary = (symbols) => {
    // the library does not know the connection: the parts that hang under it get it as an allowed parent here
    activeLibrary = (symbols || []).map((symbolType) =>
        UNDER_CONNECTION.includes(symbolType.k) && !symbolType.parents.includes(CONNECTION_TYPE.k)
            ? {...symbolType, parents: [...symbolType.parents, CONNECTION_TYPE.k]}
            : symbolType,
    )
    libraryIndex = new Map(activeLibrary.map((symbolType) => [symbolType.k, symbolType]))
}

// projects saved before the library existed carry their own components in project.custom: they are still understood
const legacyTypesOf = (project) =>
    (project.custom || [])
        .map((component) => ({
            k: 'custom:' + component.id,
            name: component.name,
            cat: component.cat || OWN_CATEGORY,
            parents: component.parents || libraryIndex.get('stopcontact')?.parents || [],
            place: component.place !== false,
            shapes: component.shapes,
        }))
        .filter((symbolType) => !libraryIndex.has(symbolType.k))

/** Every symbol type a project can use: the library plus the components stored in old projects. */
export const allTypes = (project) => [...activeLibrary, ...legacyTypesOf(project)]

/** The symbol type of a key; an unknown key gives the question-mark symbol. */
export const typeOf = (project, key) =>
    libraryIndex.get(key) ||
    (key === EMPTY_TYPE.k ? EMPTY_TYPE : null) ||
    (key === CONNECTION_TYPE.k ? CONNECTION_TYPE : null) ||
    legacyTypesOf(project).find((symbolType) => symbolType.k === key) ||
    UNKNOWN_TYPE

/**
 * The name of a symbol type in the active language. The backend stores the Dutch names of the standard symbols: as long as a standard symbol
 * keeps that name it is shown translated; a name the user typed is shown as it is.
 */
export const symbolName = (symbolType) => {
    if (!symbolType) return ''
    const dutchName = translation('symbols.' + symbolType.k, 'nl')
    if (typeof dutchName === 'string' && symbolType.name === dutchName) return t('symbols.' + symbolType.k)
    return symbolType.name
}

/** The name of a category in the active language (the standard categories are stored in Dutch; one the user typed is shown as it is). */
export const categoryName = (category) => {
    const translated = translation('categories.' + category)
    return typeof translated === 'string' ? translated : category
}
