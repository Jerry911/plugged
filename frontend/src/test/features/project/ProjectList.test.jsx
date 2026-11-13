// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The list of projects in Project → Laden: whose they are, who they are shared with, and sharing them with groups.
import {fireEvent, render, waitFor} from '@testing-library/react'
import {ProjectList} from '../../../features/project/ProjectMenu.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const summary = (id, extra = {}) => ({id, name: 'Project ' + id, updated: '2026-11-0' + id + 'T10:00:00Z', owner: {id: 1, name: 'Alice Test'}, groups: [], mine: true, canManage: true, ...extra})

/** `summaries` of the server; /api/groups answers `groups`; sharing answers the project with the chosen groups (or `shareAnswer`). */
const backend = ({summaries, groups = [], groupsStatus = 200, shareAnswer = null}) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/projects/summaries') return json(summaries)
        if (url === '/api/groups') return json(groups, groupsStatus)
        const m = /^\/api\/projects\/(\d+)\/groups$/.exec(url)
        if (m && options.method === 'PUT') {
            if (shareAnswer) return shareAnswer
            const ids = JSON.parse(options.body).groupIds
            const project = summaries.find((item) => item.id === Number(m[1]))
            return json({...project, groups: [...groups, ...project.groups].filter((group, index, all) => ids.includes(group.id) && all.findIndex((other) => other.id === group.id) === index)})
        }
        return json(null, 404)
    })
}
const mount = async (props = {}) => {
    const onLoad = vi.fn(),
        onDelete = vi.fn()
    render(<ProjectList currentId={1} refreshKey={0} onLoad={onLoad} onDelete={onDelete} {...props} />)
    await waitFor(() => getById('project-list'))
    return {onLoad, onDelete}
}
const shareRequests = () => global.fetch.mock.calls.filter((call) => call[0].endsWith('/groups') && call[1]?.method === 'PUT')

test('an own project shows nothing extra; a project of someone else shows its owner and groups, without delete or share', async () => {
    backend({
        summaries: [summary(1), summary(2, {mine: false, canManage: false, owner: {id: 3, name: 'Bob Test'}, groups: [{id: 7, name: 'Team'}, {id: 8, name: 'Bureau'}]})],
    })
    const {onLoad, onDelete} = await mount()
    expect(byId('project-meta-1')).toBeNull()
    expect(getById('project-meta-2')).toHaveTextContent(t('projects.ownedBy', {name: 'Bob Test'}) + ' · ' + t('projects.sharedWith', {groups: 'Team, Bureau'}))
    getById('project-sharebtn-1')
    getById('project-delete-1')
    expect(byId('project-sharebtn-2')).toBeNull()
    expect(byId('project-delete-2')).toBeNull()
    clickId('project-load-2')
    expect(onLoad).toHaveBeenCalledWith(2, expect.objectContaining({id: 2}))
    clickId('project-delete-1')
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({id: 1}))
})

test('an own project shared with a group shows the group; an administrator sees the owner of a project of someone else', async () => {
    backend({summaries: [summary(1, {groups: [{id: 7, name: 'Team'}]}), summary(2, {mine: false, canManage: true, owner: {id: 3, name: 'Bob Test'}})]})
    await mount()
    expect(getById('project-meta-1')).toHaveTextContent(t('projects.sharedWith', {groups: 'Team'}))
    expect(getById('project-meta-1')).not.toHaveTextContent('Alice')
    expect(getById('project-meta-2')).toHaveTextContent(t('projects.ownedBy', {name: 'Bob Test'}))
    getById('project-sharebtn-2')
    getById('project-delete-2')
})

test('sharing: tick the groups, save, and the list shows them', async () => {
    backend({summaries: [summary(1)], groups: [{id: 7, name: 'Team'}, {id: 8, name: 'Bureau'}]})
    await mount()
    clickId('project-sharebtn-1')
    expect(getById('project-sharebtn-1')).toHaveAttribute('aria-expanded', 'true')
    expect(getById('project-share-1')).toHaveTextContent(t('projects.shareIntro', {name: 'Project 1'}))
    await waitFor(() => getById('project-share-group-7'))
    expect(getById('project-share-group-7')).not.toBeChecked()
    fireEvent.click(getById('project-share-group-7'))
    fireEvent.click(getById('project-share-group-8'))
    fireEvent.click(getById('project-share-group-8'))
    clickId('project-share-save')
    await waitFor(() => expect(byId('project-share-1')).toBeNull())
    expect(JSON.parse(shareRequests()[0][1].body)).toEqual({groupIds: [7]})
    expect(getById('project-meta-1')).toHaveTextContent(t('projects.sharedWith', {groups: 'Team'}))
    // opening it again: Team is ticked; Annuleer closes without saving, so does the button
    clickId('project-sharebtn-1')
    await waitFor(() => expect(getById('project-share-group-7')).toBeChecked())
    clickId('project-share-cancel')
    expect(byId('project-share-1')).toBeNull()
    clickId('project-sharebtn-1')
    clickId('project-sharebtn-1')
    expect(byId('project-share-1')).toBeNull()
    expect(shareRequests()).toHaveLength(1)
})

test('a group an administrator shared it with stays ticked and cannot be changed by the owner', async () => {
    backend({summaries: [summary(1, {groups: [{id: 9, name: 'Andermans groep'}]})], groups: [{id: 7, name: 'Team'}]})
    await mount()
    clickId('project-sharebtn-1')
    await waitFor(() => getById('project-share-group-9'))
    expect(getById('project-share-group-9')).toBeChecked()
    expect(getById('project-share-group-9')).toBeDisabled()
    clickId('project-share-save')
    await waitFor(() => expect(byId('project-share-1')).toBeNull())
    expect(JSON.parse(shareRequests()[0][1].body)).toEqual({groupIds: [9]})
})

test('no groups yet: the panel says who makes them', async () => {
    backend({summaries: [summary(1)], groups: []})
    await mount()
    clickId('project-sharebtn-1')
    await waitFor(() => expect(getById('project-share-1')).toHaveTextContent(t('projects.shareNoGroups')))
})

test('the groups cannot be loaded, or the server refuses: the panel says so', async () => {
    backend({summaries: [summary(1)], groupsStatus: 500})
    await mount()
    clickId('project-sharebtn-1')
    await waitFor(() => expect(getById('project-share-error')).toHaveTextContent(t('projects.shareGroupsFailed')))
    expect(getById('project-share-save')).toBeDisabled()
})

test('a refusal of the server is shown in the panel', async () => {
    backend({summaries: [summary(1)], groups: [{id: 7, name: 'Team'}], shareAnswer: json({detail: 'Alleen de eigenaar'}, 403)})
    await mount()
    clickId('project-sharebtn-1')
    await waitFor(() => getById('project-share-group-7'))
    clickId('project-share-save')
    await waitFor(() => expect(getById('project-share-error')).toHaveTextContent('Alleen de eigenaar'))
    getById('project-share-1')
})

test('a refusal without a message, or no answer at all: a general message', async () => {
    backend({summaries: [summary(1)], groups: [{id: 7, name: 'Team'}], shareAnswer: {ok: false, status: 500, json: async () => Promise.reject(new Error('no json'))}})
    await mount()
    clickId('project-sharebtn-1')
    await waitFor(() => getById('project-share-group-7'))
    clickId('project-share-save')
    await waitFor(() => expect(getById('project-share-error')).toHaveTextContent(t('projects.shareFailed')))
    const fetch = global.fetch
    global.fetch = vi.fn(async (url, options) => (options?.method === 'PUT' ? Promise.reject(new Error('down')) : fetch(url, options)))
    clickId('project-share-save')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/projects/1/groups', expect.anything()))
    expect(getById('project-share-error')).toHaveTextContent(t('projects.shareFailed'))
})

describe('finding, duplicating, history and trash', () => {
    const rowIds = () => [...document.querySelectorAll('#project-list tbody tr[id^="project-row-"]')].map((row) => Number(row.id.replace('project-row-', '')))
    const list = [
        summary(1, {name: 'Woning Peeters', updated: '2026-11-01T10:00:00Z'}),
        summary(2, {name: 'appartement Janssens', updated: '2026-11-03T10:00:00Z', mine: false, canManage: false, owner: {id: 3, name: 'Bob Test'}, groups: [{id: 7, name: 'Klas 5A'}]}),
        summary(3, {name: 'Garage', updated: '2026-11-02T10:00:00Z'}),
    ]

    test('the list is searched by name, number, owner and group, and sorted as chosen', async () => {
        backend({summaries: list})
        await mount()
        expect(rowIds()).toEqual([2, 3, 1])
        fireEvent.change(getById('project-search'), {target: {value: 'woning'}})
        expect(rowIds()).toEqual([1])
        fireEvent.change(getById('project-search'), {target: {value: 'bob'}})
        expect(rowIds()).toEqual([2])
        fireEvent.change(getById('project-search'), {target: {value: '5a'}})
        expect(rowIds()).toEqual([2])
        fireEvent.change(getById('project-search'), {target: {value: 'niets hier'}})
        expect(getById('project-list-nomatch')).toHaveTextContent(t('projects.noMatch', {search: 'niets hier'}))
        fireEvent.change(getById('project-search'), {target: {value: ''}})
        fireEvent.change(getById('project-sort'), {target: {value: 'name'}})
        expect(rowIds()).toEqual([2, 3, 1])
        fireEvent.change(getById('project-sort'), {target: {value: 'number'}})
        expect(rowIds()).toEqual([1, 2, 3])
    })

    test('duplicating is offered for every project; a student only duplicates his own', async () => {
        backend({summaries: list})
        const onCopy = vi.fn()
        await mount({onCopy})
        clickId('project-copy-2')
        expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({id: 2}))
        document.body.innerHTML = ''
        await mount({onCopy, restricted: true})
        expect(byId('project-copy-2')).toBeNull()
        getById('project-copy-1')
    })

    test('the history lists the versions and restores an older one', async () => {
        backend({summaries: list})
        const fetchMock = global.fetch
        global.fetch = vi.fn(async (url, options) =>
            url === '/api/projects/1/versions'
                ? json([
                      {version: 4, savedAt: '2026-11-05T10:00:00Z', savedBy: 'Alice Test', size: 100, current: true},
                      {version: 3, savedAt: '2026-11-04T10:00:00Z', savedBy: 'Bob Test', size: 90, current: false},
                  ])
                : fetchMock(url, options),
        )
        const onRestoreVersion = vi.fn(async () => true)
        await mount({onRestoreVersion})
        clickId('project-historybtn-1')
        await waitFor(() => getById('project-version-1-4'))
        expect(getById('project-version-1-3')).toHaveTextContent('Bob Test')
        expect(byId('project-version-restore-1-4')).toBeNull()
        clickId('project-version-restore-1-3')
        await waitFor(() => expect(onRestoreVersion).toHaveBeenCalledWith(expect.objectContaining({id: 1}), 3))
        clickId('project-history-close')
        expect(byId('project-history-1')).toBeNull()
    })

    test('the trash shows the deleted projects, which come back or go for good', async () => {
        backend({summaries: list})
        const fetchMock = global.fetch
        let trash = [summary(9, {name: 'Oud project', updated: '2026-11-10T10:00:00Z'}), summary(8, {name: 'Nog ouder'})]
        global.fetch = vi.fn(async (url, options = {}) => {
            if (url === '/api/projects/trash') return json(trash)
            if (url === '/api/projects/9/untrash' && options.method === 'POST') return json(summary(9))
            if (url === '/api/projects/trash/8' && options.method === 'DELETE') return {ok: true, status: 204, json: async () => null}
            return fetchMock(url, options)
        })
        const onTrashChanged = vi.fn()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        await mount({onTrashChanged})
        clickId('project-trash-toggle')
        await waitFor(() => getById('project-trash'))
        expect(byId('project-search')).toBeNull()
        clickId('project-untrash-9')
        await waitFor(() => expect(byId('project-trash-row-9')).toBeNull())
        clickId('project-purge-8')
        await waitFor(() => getById('project-trash-empty'))
        expect(window.confirm).toHaveBeenCalledWith(t('projects.confirmPurge', {name: 'Nog ouder'}))
        expect(onTrashChanged).toHaveBeenCalledTimes(2)
        clickId('project-trash-toggle')
        await waitFor(() => getById('project-list'))
    })
})
