// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Working without a connection (the PWA, see offline/sw.js): a save that cannot reach the server is kept on this device (IndexedDB) and
// sent later (offline/sync.js). One entry per project and user: a newer save of the same project replaces the older one, but keeps the
// version of the server it was based on, so the server can still tell whether somebody else saved in between.
// An entry: {key, userId, id (null: a project that was never on the server), localId, version (the ETag it is based on), name, document,
// savedAt}. Without IndexedDB (an old browser, the unit tests) the entries live in memory for as long as the page is open.

const DATABASE = 'plugged-offline',
    STORE = 'pending',
    API_CACHE = 'plugged-api'

let memory = new Map()
let opening = null
const database = () => {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    opening ||= new Promise((resolve) => {
        try {
            const request = indexedDB.open(DATABASE, 1)
            request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'key'})
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    })
    return opening
}

const transaction = async (mode, work) => {
    const db = await database()
    if (!db) return work(null)
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode),
            store = tx.objectStore(STORE)
        let result
        Promise.resolve(work(store)).then((value) => (result = value), reject)
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error)
    })
}
const asPromise = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

const read = (store, key) => (store ? asPromise(store.get(key)) : Promise.resolve(memory.get(key)))
const write = (store, entry) => (store ? asPromise(store.put(entry)) : Promise.resolve(memory.set(entry.key, entry)))
const remove = (store, key) => (store ? asPromise(store.delete(key)) : Promise.resolve(memory.delete(key)))
const all = (store) => (store ? asPromise(store.getAll()) : Promise.resolve([...memory.values()]))

/** The key of the entry of a project: per user, the number of the project or, never stored, its local id. */
export const pendingKey = (userId, id, localId) => userId + ':' + (id != null ? id : 'new-' + localId)

/** A new local id for a project that was never on the server. */
export const newLocalId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/**
 * Keeps a save on this device: {userId, id, localId, version, name, document}. An entry that is already there for this project keeps its
 * version (the one the first unsent change was based on). Resolves to the stored entry.
 */
export const keepSave = (save) =>
    transaction('readwrite', async (store) => {
        const key = pendingKey(save.userId, save.id, save.localId),
            earlier = await read(store, key),
            entry = {...save, key, version: earlier ? earlier.version : save.version, savedAt: Date.now()}
        await write(store, entry)
        return entry
    })

/** The entries of this user, oldest first. */
export const pendingSaves = async (userId) => ((await transaction('readonly', all)) || []).filter((entry) => entry.userId === userId).sort((a, b) => a.savedAt - b.savedAt)

/**
 * The entry was sent (the server answered with `version`): it goes, unless a newer save replaced it in the meantime; that one is now based
 * on the version just stored.
 */
export const sentSave = (entry, version) =>
    transaction('readwrite', async (store) => {
        const current = await read(store, entry.key)
        if (!current) return
        if (current.savedAt === entry.savedAt) await remove(store, entry.key)
        else await write(store, {...current, version})
    })

/**
 * The entry of a never stored project got a number on the server: the entry moves to that key (when a newer save came in meanwhile) or goes.
 */
export const createdSave = (entry, id, version) =>
    transaction('readwrite', async (store) => {
        const current = await read(store, entry.key)
        if (!current) return
        await remove(store, entry.key)
        if (current.savedAt !== entry.savedAt) {
            const moved = {...current, id, version, key: pendingKey(current.userId, id)}
            await write(store, moved)
        }
    })

/** Forgets an entry (whatever its state). */
export const dropSave = (entry) => transaction('readwrite', (store) => remove(store, entry.key))

/** A failed fetch() because there is no connection (not an answer of the server). */
export const isOffline = (error) => error instanceof TypeError || error?.name === 'TypeError' || error?.name === 'AbortError'

/** Signing out: the copies of the API answers the service worker kept go (another person may use this browser next). */
export const clearOfflineCopies = async () => {
    try {
        if (typeof caches !== 'undefined') await caches.delete(API_CACHE)
    } catch {
        // no cache storage: nothing kept
    }
}

/** Unit tests: start without entries. */
export const resetOfflineStore = () => {
    memory = new Map()
}
