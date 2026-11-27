import {fireEvent, render, waitFor} from '@testing-library/react'
import SituationSchema from '../../../features/situation/SituationSchema.jsx'
import {SituationSheet} from '../../../features/situation/SituationSheet.jsx'
import {underlayFromFile, UnderlayError} from '../../../features/situation/underlayImage.js'
import {calibratedUnderlay, fittedUnderlay, MAX_PROJECT_IMAGE_BYTES} from '../../../model/underlay.js'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById, mount} from '../../utils.jsx'

// jsdom draws nothing on a canvas: the picture that is made from the file is given by the test (the real one is tested in the browser,
// e2e/underlay.spec.js)
vi.mock('../../../features/situation/underlayImage.js', async (original) => ({...(await original()), underlayFromFile: vi.fn()}))

const picture = (bytes = 3000) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4)
const sheet = (container) => container.querySelector('svg.sheet')
const choose = (name = 'plan.pdf') => fireEvent.change(getById('sit-underlay-file'), {target: {files: [new File(['x'], name, {type: 'application/pdf'})]}})
const underlay = (spy) => spy.project.sit[0].underlay
// the panels of the rail: Plan als achtergrond, Meten
const planMenu = () => fireEvent.click(getById('sit-rail-underlay')),
    measureMenu = () => fireEvent.click(getById('sit-rail-measure'))

test('an existing plan behind the page: chosen, made fit, opacity, scale with two points, moved, printed or not, removed', async () => {
    underlayFromFile.mockResolvedValue({src: picture(), width: 2770, height: 1000})
    const onStatus = vi.fn()
    const {container, spy} = mount(SituationSchema, baseProject(), {pageIndex: 0, onStatus})
    expect(byId('sit-underlay')).toBeNull()
    choose()
    await waitFor(() => getById('sit-underlay'))
    expect(underlay(spy)).toEqual(fittedUnderlay(picture(), 2770, 1000, 'plan.pdf'))
    expect(getById('sit-underlay')).toHaveAttribute('width', '277')
    expect(getById('sit-underlay')).toHaveAttribute('opacity', '0.5')
    expect(onStatus).toHaveBeenLastCalledWith(t('underlay.added'))
    // the panel of the plan: its controls instead of the add button
    planMenu()
    expect(byId('sit-underlay-add')).toBeNull()
    fireEvent.change(getById('sit-underlay-opacity'), {target: {value: '0.3'}})
    planMenu()
    expect(getById('sit-underlay')).toHaveAttribute('opacity', '0.3')

    // the scale: two clicks on the plan, then their real distance (4 m); the drawing itself gets nothing
    const before = underlay(spy)
    measureMenu()
    expect(getById('sit-underlay-scale')).toBeEnabled()
    fireEvent.click(getById('sit-underlay-scale'))
    expect(getById('sit-rail-measure')).toHaveClass('on')
    expect(getById('sit-underlay-hint')).toHaveTextContent(t('underlay.scaleHint', {point: 1}))
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('4')
    fireEvent.click(sheet(container), {clientX: 30, clientY: 60})
    expect(getById('sit-scale-point-1')).toBeTruthy()
    expect(getById('sit-underlay-hint')).toHaveTextContent(t('underlay.scaleHint', {point: 2}))
    fireEvent.click(sheet(container), {clientX: 70, clientY: 60})
    expect(prompt).toHaveBeenCalledWith(t('underlay.distancePrompt'))
    expect(underlay(spy)).toEqual(calibratedUnderlay(before, {x: 30, y: 60}, {x: 70, y: 60}, 4, 50))
    expect(underlay(spy).w).toBe(554)
    expect(spy.project.sit[0].walls).toEqual([])
    expect(spy.project.sit[0].items).toEqual([])
    expect(onStatus).toHaveBeenLastCalledWith(t('underlay.scaled'))
    expect(byId('sit-underlay-hint')).toBeNull()

    // moved by dragging it
    const placed = underlay(spy)
    planMenu()
    fireEvent.click(getById('sit-underlay-move'))
    expect(getById('sit-rail-underlay')).toHaveClass('on')
    expect(getById('sit-underlay-hint')).toHaveTextContent(t('underlay.moveHint'))
    fireEvent.pointerDown(sheet(container), {clientX: 100, clientY: 100})
    fireEvent.pointerMove(sheet(container), {clientX: 110, clientY: 95})
    fireEvent.pointerUp(sheet(container))
    expect(underlay(spy)).toMatchObject({x: placed.x + 10, y: placed.y - 5, w: placed.w})
    // a click while moving draws nothing; Esc stops
    fireEvent.click(sheet(container), {clientX: 110, clientY: 95})
    fireEvent.keyDown(document.body, {key: 'Escape'})
    expect(byId('sit-underlay-hint')).toBeNull()

    // printed (as the plan of the page) unless switched off
    const printed = () => render(<SituationSheet project={spy.project} page={spy.project.sit[0]} number={1} total={1} />).container.querySelector('image')
    expect(printed()).toBeTruthy()
    planMenu()
    fireEvent.click(getById('sit-underlay-print'))
    expect(underlay(spy).print).toBe(false)
    expect(printed()).toBeNull()
    expect(getById('sit-underlay')).toBeTruthy()

    // removed: the drawing stays
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(getById('sit-underlay-remove'))
    expect(byId('sit-rail-underlay-panel')).toBeNull()
    expect(underlay(spy)).toBeUndefined()
    expect(byId('sit-underlay')).toBeNull()
    planMenu()
    getById('sit-underlay-add')
})

test('limits: a file that cannot be used tells why; all plans of a project together stay under the limit; not on the bedradingsschema', async () => {
    const onStatus = vi.fn()
    const project = baseProject()
    project.sit.push({id: 's2', name: 'Plan 2', walls: [], items: [], underlay: {src: picture(MAX_PROJECT_IMAGE_BYTES - 1000), x: 0, y: 0, w: 10, h: 10}})
    const {spy} = mount(SituationSchema, project, {pageIndex: 0, onStatus})
    underlayFromFile.mockRejectedValueOnce(new UnderlayError('te groot'))
    choose()
    await waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('te groot'))
    // the other page already holds almost all the room
    underlayFromFile.mockResolvedValueOnce({src: picture(5000), width: 100, height: 100})
    choose()
    await waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(t('underlay.projectTooLarge', {max: MAX_PROJECT_IMAGE_BYTES / 1024 / 1024})))
    expect(spy.project.sit[0].underlay).toBeUndefined()
    // no page chosen in a PDF: nothing happens
    underlayFromFile.mockResolvedValueOnce(null)
    onStatus.mockClear()
    choose()
    await waitFor(() => expect(underlayFromFile).toHaveBeenCalledTimes(3))
    expect(onStatus).not.toHaveBeenCalled()
})

test('the bedradingsschema has no plan behind it', () => {
    const project = {...baseProject(), wire: [{id: 'w1', name: '1', walls: [], items: [], wires: []}]}
    mount(SituationSchema, project, {pageIndex: 0, listKey: 'wire'})
    expect(byId('wire-underlay-add')).toBeNull()
})
