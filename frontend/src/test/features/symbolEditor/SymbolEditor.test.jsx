// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, waitFor} from '@testing-library/react'
import SymbolEditor from '../../../features/symbolEditor/SymbolEditor.jsx'
import {setLanguage, t} from '../../../i18n/translate.js'
import {toDomId} from '../../../components/domId.js'
import {byId, getById} from '../../utils.jsx'
import standard from '../../fixtures/standard-symbols.json'

const DEFAULTS = standard

const nOf = (k) => DEFAULTS.find((d) => d.k === k).shapes.length,
    svg = () => getById('comp-drawing'),
    // number of shapes in the drawing (the first <g> of the drawing holds them)
    count = (c) => svg(c).querySelector('g').children.length,
    clk = (s, x, y) => fireEvent.click(s, {clientX: x, clientY: y}),
    mine = {k: 'custom:1', name: 'Mijn ding', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 1, y1: 12, x2: 20, y2: 12}]}
const fresh = {k: 'custom:nieuw', name: '', cat: 'Eigen', parents: ['kring'], place: true, shapes: []}
// the callbacks answer like the library hook does: save and restore give the symbol of the backend (null when refused)
const mount = (lib = DEFAULTS, ok = true) => {
    const f = {
        save: vi.fn(async (c) => (ok ? {...c, modified: c.builtin} : null)),
        remove: vi.fn(async () => true),
        restore: vi.fn(async (k) => (ok ? DEFAULTS.find((d) => d.k === k) : null)),
        restoreAll: vi.fn(async () => ok),
        makeStandard: vi.fn(async (k) => (ok ? {...DEFAULTS.find((d) => d.k === k), modified: false} : null)),
        template: vi.fn(async () => (ok ? fresh : null)),
    }
    return {
        ...render(
            <SymbolEditor
                library={lib}
                onSave={f.save}
                onRemove={f.remove}
                onRestore={f.restore}
                onRestoreAll={f.restoreAll}
                onMakeStandard={f.makeStandard}
                onTemplate={f.template}
            />,
        ),
        ...f,
    }
}
const create = async () => {
    fireEvent.click(getById('comp-new'))
    await waitFor(() => getById('comp-name'))
}
// a symbol of the menu on the left, by its key
const menuItem = (key) => getById('comp-item-' + toDomId(key))
const pick = (key) => fireEvent.click(menuItem(key))
const name = () => getById('comp-name')
// the save button says Toevoegen for a new symbol and Opslaan for a stored one
const saveButton = (kind) => {
    const button = getById('comp-save')
    expect(button).toHaveTextContent(kind === 'add' ? t('symbolEditor.add') : t('common.save'))
    return button
}
const origin = () => getById('comp-origin').textContent
const parentsTitle = () => getById('comp-parents').querySelector('summary').textContent
// the message next to the buttons (or under the intro text)
const messageShows = (key) => waitFor(() => expect(getById('comp-message')).toHaveTextContent(t(key)))
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
})

test('menu on the left lists every component by category and filters on search', () => {
    mount()
    getById('comp-intro')
    DEFAULTS.forEach((d) => expect(menuItem(d.k)).toHaveTextContent(d.name))
    fireEvent.change(getById('comp-search'), {target: {value: 'oven'}})
    menuItem('oven')
    expect(byId('comp-item-verwarming')).toBeNull()
})
test('opening a standard component shows its editor and saving keeps its key', async () => {
    const {save} = mount()
    pick('stopcontact')
    expect(name().value).toBe('Stopcontact')
    expect(getById('comp-delete')).toBeEnabled()
    expect(getById('comp-restore')).toBeDisabled()
    expect(origin()).toBe(t('symbolEditor.origin.standard'))
    fireEvent.change(name(), {target: {value: ' Stopcontact X '}})
    getById('comp-dirty')
    fireEvent.click(saveButton('save'))
    await messageShows('symbolEditor.saved')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({k: 'stopcontact', name: 'Stopcontact X'}))
    // the backend says the standard symbol was changed: it is marked, and can be restored
    expect(origin()).toBe(t('symbolEditor.origin.modified'))
    expect(getById('comp-restore')).toBeEnabled()
})
test('draws line, circle, rect, half circle and text and saves a new component', async () => {
    const {container, save} = mount()
    await create()
    const s = svg()
    clk(s, 2, 3)
    expect(container.querySelector('circle[fill="red"]')).toBeTruthy()
    clk(s, 10, 12)
    fireEvent.click(getById('comp-tool-circle'))
    clk(s, 12, 12)
    clk(s, 15, 16)
    fireEvent.click(getById('comp-tool-rect'))
    clk(s, 5, 5)
    clk(s, 9, 9)
    clk(s, 4, 4)
    clk(s, 4, 4)
    fireEvent.click(getById('comp-tool-arc'))
    clk(s, 12, 12)
    clk(s, 15, 12)
    clk(s, 9, 9)
    clk(s, 9, 9)
    vi.spyOn(window, 'prompt').mockReturnValueOnce('X').mockReturnValueOnce(null)
    fireEvent.click(getById('comp-tool-text'))
    clk(s, 6, 6)
    clk(s, 7, 7)
    expect(count(container)).toBe(7)
    fireEvent.change(name(), {target: {value: 'Test'}})
    fireEvent.change(getById('comp-category'), {target: {value: ''}})
    fireEvent.click(saveButton('add'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const c = save.mock.calls[0][0]
    expect(c).toMatchObject({name: 'Test', cat: 'Eigen', place: true})
    expect(c.k).toMatch(/^custom:/)
    expect(c.shapes.map((h) => h.t)).toEqual(['line', 'circle', 'rect', 'rect', 'arc', 'arc', 'text'])
    expect(c.shapes[1].r).toBe(5)
    expect(c.shapes[3]).toMatchObject({w: 1, h: 1})
    expect(c.shapes[4]).toEqual({t: 'arc', cx: 12, cy: 12, r: 3, a1: -90, a2: 90})
    expect(c.shapes[5].r).toBe(1)
})
test('the grid size dropdown changes the drawing grid and snaps clicks to it', async () => {
    const {container, save} = mount()
    await create()
    const grid = getById('comp-grid'),
        s = svg()
    expect([...grid.options].map((o) => o.value)).toEqual(['0.5', '1', '2', '4'])
    expect(grid.value).toBe('1')
    expect(container.querySelector('pattern').getAttribute('width')).toBe('1')
    fireEvent.change(grid, {target: {value: '0.5'}})
    expect(container.querySelector('pattern').getAttribute('width')).toBe('0.5')
    clk(s, 2.3, 3.8)
    clk(s, 10.2, 12.4)
    fireEvent.change(grid, {target: {value: '2'}})
    expect(container.querySelector('pattern').getAttribute('width')).toBe('2')
    clk(s, 3, 5)
    clk(s, 3.2, 5.1)
    fireEvent.click(getById('comp-tool-rect'))
    clk(s, 3, 3)
    clk(s, 3.4, 3.2)
    fireEvent.change(name(), {target: {value: 'Raster'}})
    fireEvent.click(saveButton('add'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const [l1, l2, r] = save.mock.calls[0][0].shapes
    expect(l1).toEqual({t: 'line', x1: 2.5, y1: 4, x2: 10, y2: 12.5})
    expect(l2).toEqual({t: 'line', x1: 4, y1: 6, x2: 4, y2: 6})
    expect(r).toEqual({t: 'rect', x: 4, y: 4, w: 2, h: 2})
})
test('requires a name and at least one shape', async () => {
    const {container} = mount()
    await create()
    fireEvent.click(saveButton('add'))
    expect(window.alert).toHaveBeenCalledTimes(1)
    fireEvent.change(name(), {target: {value: 'A'}})
    fireEvent.click(saveButton('add'))
    expect(window.alert).toHaveBeenCalledTimes(2)
    clk(svg(), 1, 1)
    clk(svg(), 3, 3)
    fireEvent.click(saveButton('add'))
    expect(window.alert).toHaveBeenCalledTimes(2)
})
test('undo and clear', () => {
    const {container} = mount()
    fireEvent.click(menuItem('teller'))
    const n = nOf('teller')
    expect(count(container)).toBe(n)
    clk(svg(), 1, 1)
    clk(svg(), 5, 5)
    expect(count(container)).toBe(n + 1)
    fireEvent.click(getById('comp-undo-shape'))
    expect(count(container)).toBe(n)
    fireEvent.click(getById('comp-clear'))
    expect(count(container)).toBe(0)
})
test('parents and placement can be changed', async () => {
    const {save} = mount([...DEFAULTS, mine])
    pick('custom_1')
    expect(parentsTitle()).toBe(t('symbolEditor.parents', {count: 1}))
    fireEvent.click(getById('comp-parents-all'))
    expect(parentsTitle()).toBe(t('symbolEditor.parents', {count: DEFAULTS.length + 1}))
    fireEvent.click(getById('comp-parents-none'))
    expect(parentsTitle()).toBe(t('symbolEditor.parents', {count: 0}))
    fireEvent.click(getById('comp-parent-oven'))
    fireEvent.click(getById('comp-parent-kring'))
    fireEvent.click(getById('comp-parent-oven'))
    fireEvent.click(getById('comp-placeable'))
    fireEvent.click(saveButton('save'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({parents: ['kring'], place: false})
})
test('a standard component can be restored to its default', async () => {
    const {restore, container} = mount()
    pick('oven')
    clk(svg(), 1, 1)
    clk(svg(), 5, 5)
    const b = getById('comp-restore')
    expect(b).toBeEnabled()
    fireEvent.click(b)
    await messageShows('symbolEditor.restored')
    expect(restore).toHaveBeenCalledWith('oven')
    expect(getById('comp-restore')).toBeDisabled()
    expect(count(container)).toBe(nOf('oven'))
})
test('own components can be removed after confirmation', async () => {
    const {remove} = mount([...DEFAULTS, mine])
    pick('custom_1')
    window.confirm.mockReturnValueOnce(false)
    fireEvent.click(getById('comp-delete'))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(getById('comp-delete'))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('custom:1'))
    getById('comp-intro')
})
test('standard components can be removed too, after confirmation that mentions the way back', async () => {
    const {remove} = mount()
    pick('oven')
    fireEvent.click(getById('comp-delete'))
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringMatching(/Alle standaard herstellen/))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('oven'))
    getById('comp-intro')
})
test('duplicate makes an own copy of a standard component', () => {
    mount()
    pick('oven')
    fireEvent.click(getById('comp-duplicate'))
    expect(name().value).toBe('Oven (kopie)')
    expect(byId('comp-restore')).toBeNull()
})
test('switching away from unsaved changes asks for confirmation', () => {
    mount()
    pick('oven')
    fireEvent.change(name(), {target: {value: 'Oven 2'}})
    window.confirm.mockReturnValueOnce(false)
    pick('motor')
    expect(name().value).toBe('Oven 2')
    pick('motor')
    expect(name().value).toBe('Motor')
})
test('tells when the backend did not accept the symbol, and keeps the changes', async () => {
    mount(DEFAULTS, false)
    pick('oven')
    fireEvent.change(name(), {target: {value: 'Oven 2'}})
    fireEvent.click(saveButton('save'))
    await messageShows('symbolEditor.notSaved')
    expect(name().value).toBe('Oven 2')
})
test('an edited standard symbol is marked in the menu, an own symbol is labelled as such', () => {
    mount([...DEFAULTS.map((d) => (d.k === 'oven' ? {...d, modified: true} : d)), mine])
    expect(menuItem('oven').textContent).toMatch(/ ✎$/)
    expect(menuItem('motor').textContent).not.toMatch(/✎/)
    pick('oven')
    expect(origin()).toBe(t('symbolEditor.origin.modified'))
    expect(getById('comp-restore')).toBeEnabled()
    pick('custom_1')
    expect(origin()).toBe(t('symbolEditor.origin.own'))
})
test('a new component starts from the template of the backend; without backend nothing starts', async () => {
    const {template} = mount()
    await create()
    expect(template).toHaveBeenCalledTimes(1)
    expect(origin()).toBe(t('symbolEditor.origin.own'))
    expect(parentsTitle()).toBe(t('symbolEditor.parents', {count: 1}))
    const down = mount(DEFAULTS, false)
    fireEvent.click(down.container.querySelector('#comp-new'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(t('symbolEditor.newNotPossible')))
})
test('all standard symbols can be restored after confirmation', async () => {
    const {restoreAll} = mount()
    pick('oven')
    window.confirm.mockReturnValueOnce(false)
    fireEvent.click(getById('comp-restore-all'))
    expect(restoreAll).not.toHaveBeenCalled()
    fireEvent.click(getById('comp-restore-all'))
    await messageShows('symbolEditor.allRestored')
    expect(restoreAll).toHaveBeenCalledTimes(1)
    getById('comp-intro')
})
test('tells when restoring is not possible', async () => {
    const {restore, restoreAll} = mount(DEFAULTS, false)
    pick('oven')
    fireEvent.change(name(), {target: {value: 'Oven 2'}})
    fireEvent.click(getById('comp-restore'))
    await messageShows('symbolEditor.notRestored')
    expect(restore).toHaveBeenCalledWith('oven')
    fireEvent.click(getById('comp-restore-all'))
    await waitFor(() => expect(restoreAll).toHaveBeenCalled())
    await messageShows('symbolEditor.notRestored')
})
test('after the first click the outline follows the mouse and the second click finalizes it on the grid', async () => {
    const {container, save} = mount()
    await create()
    const s = svg(),
        preview = () => container.querySelector('g[stroke-dasharray]')
    fireEvent.click(getById('comp-tool-circle'))
    fireEvent.mouseMove(s, {clientX: 12, clientY: 12})
    expect(preview()).toBeNull()
    clk(s, 12, 12)
    expect(preview().querySelector('circle')).toHaveAttribute('r', '1') // the mouse is still on the centre: minimum radius
    fireEvent.mouseMove(s, {clientX: 15.2, clientY: 12})
    expect(preview().querySelector('circle')).toHaveAttribute('r', '3')
    fireEvent.mouseMove(s, {clientX: 16, clientY: 12})
    expect(preview().querySelector('circle')).toHaveAttribute('r', '4')
    expect(count(container)).toBe(0) // not final yet
    clk(s, 16, 12)
    expect(preview()).toBeNull()
    expect(count(container)).toBe(1)
    fireEvent.change(name(), {target: {value: 'Rond'}})
    fireEvent.click(saveButton('add'))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0].shapes[0]).toEqual({t: 'circle', cx: 12, cy: 12, r: 4})
})
test('Escape cancels the shape that is being drawn', async () => {
    const {container} = mount()
    await create()
    const s = svg()
    clk(s, 3, 3)
    expect(container.querySelector('circle[fill="red"]')).toBeTruthy()
    fireEvent.keyDown(window, {key: 'Escape'})
    expect(container.querySelector('circle[fill="red"]')).toBeNull()
})
test('name and category have labels below each other, the grid selector sits in the drawing area, the menu list scrolls', async () => {
    const {container} = mount()
    await create()
    getById('comp-name')
    getById('comp-category')
    expect(container.querySelector('.cdraw .gridsel')).toContainElement(getById('comp-grid'))
    expect(container.querySelector('.pal .complist')).toBeTruthy()
    // the action group and the tool group are separate groups
    const actions = container.querySelector('.cactions'),
        tools = container.querySelector('.ctools')
    ;['comp-save', 'comp-duplicate', 'comp-undo-shape', 'comp-clear'].forEach((id) => expect(actions).toContainElement(getById(id)))
    ;['comp-tool-line', 'comp-tool-text'].forEach((id) => expect(tools).toContainElement(getById(id)))
})
test('the shapes list is gone', () => {
    mount()
    pick('oven')
    expect(byId('comp-shapes')).toBeNull()
    expect(document.querySelectorAll('[id^="comp-shape-delete"]')).toHaveLength(0)
})
test('name and category are right of the drawing below the previews and above the placement option; the hint is where they used to be', async () => {
    const {container} = mount()
    await create()
    const info = container.querySelector('.cinfo'),
        fields = container.querySelector('.cfields'),
        place = getById('comp-placeable'),
        hint = getById('comp-hint')
    expect(info).toContainElement(fields)
    expect(fields.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(info.querySelector('svg').compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hint.compareDocumentPosition(container.querySelector('.cactions')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('.cwork').contains(hint)).toBe(false)
})
test('"Maak standaard" sits under "Standaard herstellen", is a danger button, and makes the current drawing the new standard', async () => {
    const {makeStandard, save, container} = mount()
    pick('oven')
    const group = container.querySelector('.ctools'),
        restore = getById('comp-restore'),
        make = getById('comp-make-standard')
    expect(group).toContainElement(restore)
    expect(group).toContainElement(make)
    expect(restore.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(make).toHaveClass('danger')
    expect(make.querySelector('svg')).toBeTruthy()
    expect(make).toBeDisabled() // nothing changed yet
    fireEvent.change(name(), {target: {value: 'Oven 2'}})
    expect(make).toBeEnabled()
    window.confirm.mockReturnValueOnce(false)
    fireEvent.click(make)
    expect(makeStandard).not.toHaveBeenCalled()
    fireEvent.click(make)
    await messageShows('symbolEditor.madeStandard')
    // unsaved changes are saved first
    expect(save).toHaveBeenCalledWith(expect.objectContaining({k: 'oven', name: 'Oven 2'}))
    expect(makeStandard).toHaveBeenCalledWith('oven')
})
test('"Maak standaard" is only there for standard symbols and tells when the backend refuses', async () => {
    mount([...DEFAULTS, mine], false)
    pick('custom_1')
    expect(byId('comp-make-standard')).toBeNull()
    pick('oven')
    fireEvent.change(name(), {target: {value: 'Oven 2'}})
    fireEvent.click(getById('comp-make-standard').closest('button'))
    await messageShows('symbolEditor.notSaved')
})
test('in another language the menu and the name field show the translated name; saving it unchanged keeps the stored name', async () => {
    setLanguage('fr')
    const {save} = mount()
    expect(menuItem('stopcontact')).toHaveTextContent('Prise de courant')
    expect(getById('comp-category-Stopcontacten')).toHaveTextContent('Prises de courant')
    pick('stopcontact')
    expect(name().value).toBe('Prise de courant')
    fireEvent.click(getById('comp-placeable'))
    fireEvent.click(saveButton('save'))
    await messageShows('symbolEditor.saved')
    // the backend keeps the Dutch name of the standard symbol, so it is still translated in every language
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({k: 'stopcontact', name: 'Stopcontact', place: false}))
    fireEvent.change(name(), {target: {value: 'Prise de la cuisine'}})
    fireEvent.click(saveButton('save'))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({name: 'Prise de la cuisine'})))
})
