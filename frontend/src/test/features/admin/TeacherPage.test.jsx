// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, waitFor} from '@testing-library/react'
import TeacherPage from '../../../features/admin/TeacherPage.jsx'
import {fetchOwnedGroups, setGroupOwner} from '../../../api/authApi.js'
import {t} from '../../../i18n/translate.js'
import {getById} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})

test('switching off, and a refusal of the server', async () => {
    let educational = true
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/groups/owned') return json([{id: 7, name: 'Klas 5', educational, members: []}])
        if (options.method === 'PUT') {
            if (educational === false) return json({detail: 'Alleen een eigenaar'}, 403)
            educational = false
            return json({id: 7, name: 'Klas 5', educational, members: []})
        }
        return json(null, 404)
    })
    render(<TeacherPage />)
    await waitFor(() => expect(getById('group-7-educational')).toBeChecked())
    expect(getById('group-7')).toHaveClass('edu')
    expect(getById('group-7')).toHaveTextContent(t('educational.on'))
    fireEvent.click(getById('group-7-educational'))
    await waitFor(() => expect(getById('teacher-message')).toHaveTextContent(t('educational.switchedOff', {group: 'Klas 5'})))
    await waitFor(() => expect(getById('group-7-educational')).not.toBeChecked())
    fireEvent.click(getById('group-7-educational'))
    await waitFor(() => expect(getById('teacher-message')).toHaveTextContent('Alleen een eigenaar'))
})

test('the groups cannot be loaded', async () => {
    global.fetch = vi.fn(async () => json(null, 500))
    render(<TeacherPage />)
    await waitFor(() => expect(getById('teacher-failed')).toHaveTextContent(t('teacher.loadFailed')))
})

test('the api calls', async () => {
    global.fetch = vi.fn(async () => json({}))
    expect(await fetchOwnedGroups()).toEqual([])
    await setGroupOwner(7, 3, true)
    await setGroupOwner(7, 3, false)
    expect(global.fetch.mock.calls.slice(1).map((call) => [call[0], call[1].method])).toEqual([
        ['/api/admin/groups/7/owners/3', 'PUT'],
        ['/api/admin/groups/7/owners/3', 'DELETE'],
    ])
})
