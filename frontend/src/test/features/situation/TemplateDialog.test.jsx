// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Situatieschema → Sjabloon: choosing a starter floor plan and putting it on the sheets.
import {fireEvent, render} from '@testing-library/react'
import SituationSchema from '../../../features/situation/SituationSchema.jsx'
import TemplateDialog, {templateChoice} from '../../../features/situation/TemplateDialog.jsx'
import {PLAN_TEMPLATES} from '../../../model/planTemplates.js'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById, mount} from '../../utils.jsx'

const template = (id) => PLAN_TEMPLATES.find((candidate) => candidate.id === id)
const project = (sit = [{id: 's1', name: 'Blad 1', walls: [], items: []}], schaal = '1:50') => ({...baseProject(), footer: {...baseProject().footer, schaal}, sit})
const drawn = (id) => ({id, name: 'Ontwerp', walls: [{id: 'w1', x1: 10, y1: 10, x2: 50, y2: 10}], items: []})

test('every template is shown with a preview of each floor, its size and where it goes', () => {
    const onChoose = vi.fn()
    render(<TemplateDialog project={project()} pageIndex={0} onChoose={onChoose} onClose={() => {}} />)
    PLAN_TEMPLATES.forEach((candidate) => {
        const card = getById('template-' + candidate.id)
        expect(card).toHaveTextContent(t('templates.names.' + candidate.id))
        expect(card.querySelectorAll('svg.tplfloor')).toHaveLength(candidate.floors.length)
        // each as large as the sheet allows: the scale of the project (1:50) where that is the best one
        const best = {studio: 40, apartment: 50, terraced: 40, detached: 50}[candidate.id]
        expect(getById('template-' + candidate.id + '-scale')).toHaveTextContent(
            best === 50 ? t('templates.fits', {scale: 50}) : t('templates.changesScale', {scale: best}),
        )
    })
    expect(getById('template-studio')).toHaveTextContent(t('templates.thisPage'))
    expect(getById('template-terraced')).toHaveTextContent(t('templates.thisPageAndNew', {count: 1}))
    fireEvent.click(getById('template-terraced-use'))
    expect(onChoose).toHaveBeenCalledWith(template('terraced'), 40)
})

test('while nothing is drawn a template fills the sheet: a smaller scale than the project has (1:75 becomes 1:50)', () => {
    expect(templateChoice(template('detached'), project(undefined, '1:75'), 0, t)).toMatchObject({scale: 50, changesScale: true, blocked: false})
    expect(templateChoice(template('detached'), project(undefined, '1:50'), 0, t)).toMatchObject({scale: 50, changesScale: false})
    // with a drawing the scale of the project stays: the lengths on it would change
    const busy = project([{id: 's1', name: 'Blad 1', walls: [], items: []}, drawn('s2')], '1:75')
    expect(templateChoice(template('detached'), busy, 0, t)).toMatchObject({scale: 75, changesScale: false, blocked: false})
    // also a drawing on the bedradingsschema (the scale is the one of the whole project)
    const wired = {...project(undefined, '1:75'), wire: [{id: 'w1', name: 'B', walls: [], items: [], wires: [{id: 'w', a: {x: 0, y: 0}, b: {x: 9, y: 0}, points: []}], boxes: []}]}
    expect(templateChoice(template('detached'), wired, 0, t)).toMatchObject({scale: 75, changesScale: false})
})

test('a template that needs a larger scale: the scale changes while nothing is drawn, else it cannot be chosen', () => {
    // at 1:20 none of them fits
    const empty = templateChoice(template('detached'), project(undefined, '1:20'), 0, t)
    expect(empty).toMatchObject({scale: 50, changesScale: true, blocked: false})
    const busy = templateChoice(template('detached'), project([{id: 's1', name: 'Blad 1', walls: [], items: []}, drawn('s2')], '1:20'), 0, t)
    expect(busy).toMatchObject({changesScale: true, blocked: true})
    const onClose = vi.fn()
    render(<TemplateDialog project={project([{id: 's1', name: 'Blad 1', walls: [], items: []}, drawn('s2')], '1:20')} pageIndex={0} onChoose={() => {}} onClose={onClose} />)
    expect(getById('template-detached-use')).toBeDisabled()
    expect(getById('template-detached-scale')).toHaveTextContent(t('templates.blocked', {scale: 20}))
    fireEvent.keyDown(getById('template-detached-use'), {key: 'Escape'})
    expect(onClose).toHaveBeenCalled()
})

test('on an empty sheet: the first floor goes there, the next one on a new sheet right after it; one undo step', () => {
    const onPageIndex = vi.fn(),
        onStatus = vi.fn(),
        {spy} = mount(SituationSchema, project(), {pageIndex: 0, onPageIndex, onStatus})
    getById('sit-empty')
    fireEvent.click(getById('sit-empty-template'))
    fireEvent.click(getById('template-terraced-use'))
    expect(byId('template-dialog')).toBeNull()
    const sit = spy.project.sit
    expect(sit.map((page) => page.name)).toEqual([t('templates.floors.ground'), t('templates.floors.first')])
    expect(sit[0].id).toBe('s1')
    expect(sit[0].walls.length).toBeGreaterThan(8)
    expect(sit[0].items.filter((item) => item.kind === 'door')).toHaveLength(template('terraced').floors[0].doors.length)
    expect(sit[1].items.map((item) => item.txt).filter(Boolean)).toContain(t('templates.rooms.bathroom'))
    expect(onPageIndex).toHaveBeenCalledWith(0)
    expect(onStatus).toHaveBeenCalledWith(t('templates.inserted', {name: t('templates.names.terraced')}))
    expect(byId('sit-empty')).toBeNull()
})

test('on a sheet with a drawing: every floor on new sheets after it, and the first new sheet is shown', () => {
    const onPageIndex = vi.fn(),
        {spy} = mount(SituationSchema, project([drawn('s1'), {id: 's2', name: 'Tuin', walls: [], items: []}]), {pageIndex: 0, onPageIndex})
    expect(byId('sit-empty')).toBeNull()
    fireEvent.click(getById('sit-template'))
    expect(getById('template-studio')).toHaveTextContent(t('templates.newPages', {count: 1}))
    fireEvent.click(getById('template-studio-use'))
    expect(spy.project.sit.map((page) => page.name)).toEqual(['Ontwerp', t('templates.floors.single'), 'Tuin'])
    expect(spy.project.sit[0].walls).toHaveLength(1)
    expect(onPageIndex).toHaveBeenCalledWith(1)
})

test('a template that needs a larger scale sets the scale of the project', () => {
    const {spy} = mount(SituationSchema, project(undefined, '1:20'), {pageIndex: 0})
    fireEvent.click(getById('sit-template'))
    expect(getById('template-apartment-scale')).toHaveTextContent(t('templates.changesScale', {scale: 50}))
    fireEvent.click(getById('template-apartment-use'))
    expect(spy.project.footer.schaal).toBe('1:50')
})
