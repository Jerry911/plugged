// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Educational mode in the editor: a student (user.restricted) gets no validation and cannot import or export; a teacher (owner of a group)
// gets "Mijn groepen" with the switch.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import standard from '../fixtures/standardSymbols.js'
import {t} from '../../i18n/translate.js'
import {byId, clickId, getById} from '../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const user = (extra = {}) => ({id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: true, restricted: false, ownedGroups: [], ...extra})
// a project with a circuit that has a problem (so validation would report something)
const PROJECT = {een: [{id: 'p1', name: 'Blad 1', tree: [{id: 'k1', type: 'kring', props: {}, children: [{id: 'l1', type: 'lichtpunt', props: {}, children: []}]}]}], sit: [{id: 's1', name: 'Plan 1', walls: [], items: []}], footer: {}}

/** `status()` answers /api/auth/status (a function, so a test can change the user); the owned groups answer `owned`. */
const backend = (status, owned = []) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/auth/status') return json({setupRequired: false, adminEmail: 'admin@example.be', user: status()})
        if (url === '/api/symbols') return json(standard)
        if (url === '/api/projects/summaries') return json([{id: 1, name: null, updated: '2026-11-04T10:00:00Z', mine: true, canManage: true, groups: []}])
        if (url === '/api/projects/1') return json(PROJECT)
        if (url === '/api/groups/owned') return json(owned)
        if (url === '/api/groups/7/educational') return json({...owned[0], educational: JSON.parse(options.body).educational})
        return json(null, 404)
    })
}
const mount = async () => {
    render(<App />)
    await waitFor(() => getById('tab-comp'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/projects/1', expect.anything()))
    await act(async () => {})
}

test('a student: no validation, import and export switched off, a badge that says why', async () => {
    backend(() => user({restricted: true}))
    await mount()
    // only the symbol; the words on mouse-over
    expect(getById('educational-badge')).toHaveTextContent(/^🎓$/)
    expect(getById('educational-badge')).toHaveAttribute('title', t('educational.badge'))
    expect(byId('btn-verify')).toBeNull()
    expect(getById('tab-een')).not.toHaveTextContent('✖')
    expect(getById('tab-een')).not.toHaveTextContent('⚠')
    fireEvent.click(getById('tab-project'))
    expect(getById('btn-import')).toBeDisabled()
    expect(getById('btn-export')).toBeDisabled()
    expect(getById('btn-export')).toHaveAttribute('title', t('educational.locked'))
    // a file that still reaches the hidden file field is not imported
    const file = new File(['{"een":[]}'], 'p.json', {type: 'application/json'})
    file.text = async () => '{"een":[]}'
    await act(async () => fireEvent.change(getById('import-input'), {target: {files: [file]}}))
    expect(getById('eds-page-1')).toHaveTextContent('Blad 1')
    expect(byId('tab-teacher')).toBeNull()
    // nor through the shortcuts: Alt+I and Alt+E do nothing (and the browser does not take them over either)
    const picker = vi.spyOn(getById('import-input'), 'click').mockImplementation(() => {})
    for (const key of ['i', 'e']) {
        const event = new KeyboardEvent('keydown', {key, altKey: true, bubbles: true, cancelable: true})
        act(() => window.dispatchEvent(event))
        expect(event.defaultPrevented).toBe(true)
    }
    expect(picker).not.toHaveBeenCalled()
    expect(byId('export-confirm')).toBeNull()
})

test('everybody else validates, imports and exports as before', async () => {
    backend(() => user())
    await mount()
    expect(byId('educational-badge')).toBeNull()
    getById('btn-verify')
    fireEvent.click(getById('tab-project'))
    expect(getById('btn-import')).not.toBeDisabled()
    expect(getById('btn-export')).not.toBeDisabled()
})

test('the mode follows the teacher while the student works: the status is fetched again on focus', async () => {
    let restricted = false
    backend(() => user({restricted}))
    await mount()
    getById('btn-verify')
    restricted = true
    await act(async () => window.dispatchEvent(new Event('focus')))
    await waitFor(() => getById('educational-badge'))
    expect(byId('btn-verify')).toBeNull()
})

test('a teacher gets Mijn groepen and switches the educational mode of his group', async () => {
    const group = {id: 7, name: 'Klas 5', educational: false, members: [{id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', owner: true}, {id: 3, name: 'Piet', surname: 'X', email: 'piet@example.be', owner: false}]}
    backend(() => user({ownedGroups: [7]}), [group])
    await mount()
    clickId('tab-teacher')
    await waitFor(() => getById('group-7'))
    expect(getById('tab-teacher')).toHaveClass('on')
    expect(getById('group-7')).toHaveTextContent('★ Jan Peeters')
    expect(getById('group-7-educational')).not.toBeChecked()
    fireEvent.click(getById('group-7-educational'))
    await waitFor(() => expect(getById('teacher-message')).toHaveTextContent(t('educational.switchedOn', {group: 'Klas 5'})))
    expect(global.fetch).toHaveBeenCalledWith('/api/groups/7/educational', expect.objectContaining({method: 'PUT', body: '{"educational":true}'}))
})

test('a student: on the situatieschema the elements to place are a plain list, without warning or counts', async () => {
    backend(() => user({restricted: true}))
    await mount()
    expect(byId('tab-sit-unplaced')).toBeNull()
    fireEvent.click(getById('tab-sit'))
    await waitFor(() => getById('sit-unplaced'))
    expect(getById('sit-unplaced')).toHaveClass('neutral')
    expect(getById('sit-unplaced')).not.toHaveClass('warn')
    expect(getById('sit-unplaced-title')).toHaveTextContent(t('situation.elementsTitle'))
    expect(getById('sit-unplaced')).not.toHaveTextContent('⚠')
    expect(getById('sit-place-all')).toHaveTextContent(t('situation.placeAllNeutral'))
    // the element is still placed with a click
    fireEvent.click(getById('unplaced-l1'))
    await waitFor(() => expect(getById('sit-nothing-to-place')).toHaveTextContent(t('situation.nothingToPlace')))
    expect(byId('sit-all-placed')).toBeNull()
    // collapsed: no count either
    fireEvent.click(getById('sit-unplaced-toggle'))
    expect(getById('sit-unplaced-toggle')).toHaveAttribute('title', t('situation.elementsOpen'))
    expect(getById('sit-unplaced-toggle').querySelector('.badge')).toBeNull()
})

test('everybody else is warned about unplaced elements as before', async () => {
    backend(() => user())
    await mount()
    expect(getById('tab-sit-unplaced')).toHaveTextContent('⚠1')
    fireEvent.click(getById('tab-sit'))
    await waitFor(() => expect(getById('sit-unplaced')).toHaveClass('warn'))
    fireEvent.click(getById('sit-unplaced-toggle'))
    expect(getById('sit-unplaced-toggle').querySelector('.badge')).toHaveTextContent('1')
})
