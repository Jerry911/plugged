// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Shared helpers of the unit tests. Elements are found by their id (byId), never by the text they show, so the tests keep working when a
// text is reworded or the language changes; texts are compared with t() of the active language (Dutch, see setup.js).
import {useState} from 'react'
import {fireEvent, render} from '@testing-library/react'

/** A small project: one eendraadschema page and one plan. */
export const baseProject = () => ({
    footer: {titel: 'T', datum: '2026-01-01', schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: 'Blad 1', tree: []}],
    sit: [{id: 's1', name: 'Plan 1', walls: [], items: []}],
    custom: [],
})
/** An element of the tree whose label is its id. */
export const node = (id, type, children = [], extra = {}) => ({id, type, label: id, info: '', children, ...extra})

/** The element with this id (null when there is none). */
export const byId = (id) => document.getElementById(id)
/** The element with this id; fails the test when there is none. */
export const getById = (id) => {
    const element = document.getElementById(id)
    if (!element) throw new Error(`no element with id "${id}"`)
    return element
}
export const clickId = (id) => fireEvent.click(getById(id))
export const typeInto = (id, value) => fireEvent.change(getById(id), {target: {value}})
export const checkId = (id, checked = true) => fireEvent.click(getById(id), {target: {checked}})

// renders component `Component` with a real project state: `spy.project` is always the current project
const Harness = ({Component, initialProject, spy, ...props}) => {
    const [project, setProject] = useState(initialProject)
    spy.project = project
    return <Component project={project} setProject={setProject} {...props} />
}
export const mount = (Component, initialProject, props = {}) => {
    const spy = {}
    return {...render(<Harness Component={Component} initialProject={initialProject} spy={spy} {...props} />), spy}
}
