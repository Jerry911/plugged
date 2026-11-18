// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// A new project and the conversion of stored or imported documents (also of older formats) to the current format.
import {defaultTree} from '../model/boardLayout.js'
import {flatten, newId} from '../model/tree.js'
import {migrateSurgeProtection, migrateWaterproof} from '../model/project.js'
import {t} from '../i18n/translate.js'
import {emptyWiringPage} from '../model/wiring.js'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * A new, empty project: one eendraadschema page with a connection and a board, one empty plan and one empty bedradingsschema (page names in the
 * active language).
 */
export const newProject = () => ({
    footer: {datum: today(), schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: t('pages.sheetName', {number: 1}), tree: defaultTree()}],
    sit: [{id: 's1', name: t('pages.planName', {number: 1}), walls: [], items: []}],
    wire: [emptyWiringPage('w1', t('pages.wiringName', {number: 1}))],
    custom: [],
})

/** A project without circuits and without anything drawn on the plans and the bedradingsschema. */
export const isProjectEmpty = (project) =>
    !project.een.some((page) => flatten(page.tree).some((node) => node.type === 'kring')) &&
    !project.sit.some((page) => page.walls.length || page.items.length) &&
    !(project.wire || []).some((page) => page.walls.length || page.items.length || page.wires.length || page.boxes.length)

// Old projects had one tree (`tree`) and one plan (`plan`) instead of pages; their items were turned with `a` instead of `r`.
const toCurrentFormat = (document) => {
    const empty = newProject()
    if (document.een) return {...empty, ...document}
    return {
        ...empty,
        footer: {...empty.footer, ...document.footer},
        custom: document.custom || [],
        een: [{id: newId(), name: t('pages.sheetName', {number: 1}), tree: document.tree || []}],
        sit: [
            {
                id: newId(),
                name: t('pages.planName', {number: 1}),
                walls: document.plan?.walls || [],
                items: (document.plan?.items || []).map((item) => ({...item, r: item.r ?? item.a ?? 0})),
            },
        ],
    }
}

// Projects of before the bedradingsschema have no `wire` pages (they get the empty one of a new project); every wire page has all its lists.
const completeWiring = (project) => ({
    ...project,
    wire: (Array.isArray(project.wire) && project.wire.length ? project.wire : newProject().wire).map((page) => ({
        ...emptyWiringPage(page.id, page.name),
        ...page,
    })),
})

/** A stored or imported document as a project of the current format. */
export const normalizeProject = (document) => completeWiring(migrateSurgeProtection(migrateWaterproof(toCurrentFormat(document))))
