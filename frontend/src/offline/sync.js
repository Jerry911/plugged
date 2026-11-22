// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Sends the saves kept on this device (offline/offlineStore.js) to the server, once there is a connection again, oldest first.
// - a project on the server: saved on top of the version it was based on. When somebody else saved it in between, nothing is overwritten:
//   the work of this device becomes a new project (a copy, "<name> (offline <date>)") and the user is told;
// - a project that was never on the server: created.
// It stops at the first entry that cannot reach the server (still offline) or that the server refuses for another reason (signed out: it is
// tried again after signing in). Every outcome goes to `report`: {entry, outcome: 'saved' | 'created' | 'copied' | 'refused', id}.
import {createProject, knownVersion, saveProject} from '../api/projectApi.js'
import {createdSave, dropSave, isOffline, pendingSaves, sentSave} from './offlineStore.js'

let running = null

/** The name of the copy that keeps the work of this device when the project changed on the server in the meantime. */
export const offlineCopyName = (name, translate, locale) => translate('offline.copyName', {name: name || translate('offline.unnamed'), date: new Date().toLocaleString(locale)})

/** Sends what is kept for `userId`; resolves to the number of entries that are still waiting. One run at a time. */
export const syncPending = (userId, {report = () => {}, translate = (key) => key, locale} = {}) => {
    running ||= (async () => {
        try {
            for (const entry of await pendingSaves(userId)) {
                try {
                    if (entry.id == null) {
                        const id = await createProject(entry.document, {offlineError: true})
                        if (id == null) {
                            report({entry, outcome: 'refused'})
                            break
                        }
                        await createdSave(entry, id, knownVersion(id))
                        report({entry, outcome: 'created', id})
                        continue
                    }
                    let conflict = false
                    const stored = await saveProject(entry.id, entry.document, {version: entry.version, onConflict: () => (conflict = true)})
                    if (stored) {
                        await sentSave(entry, knownVersion(entry.id))
                        report({entry, outcome: 'saved', id: entry.id})
                    } else if (conflict) {
                        const name = offlineCopyName(entry.name || entry.document?.name, translate, locale),
                            id = await createProject({...entry.document, name}, {offlineError: true})
                        if (id == null) {
                            report({entry, outcome: 'refused'})
                            break
                        }
                        await dropSave(entry)
                        report({entry, outcome: 'copied', id, name})
                    } else {
                        report({entry, outcome: 'refused'})
                        break
                    }
                } catch (error) {
                    if (!isOffline(error)) report({entry, outcome: 'refused'})
                    break
                }
            }
            return (await pendingSaves(userId)).length
        } finally {
            running = null
        }
    })()
    return running
}
