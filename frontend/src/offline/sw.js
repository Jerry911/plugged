// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The service worker of Plugged (the PWA): the application keeps opening without a connection.
// - The application itself (index.html and the files of the build, listed by the build in PRECACHE) is stored at installation; a page is
//   asked from the network first and taken from the store when the network is not there.
// - Files of the build (/assets/..., their names change with every version) and the other static files (icons, Info pictures) come from the
//   store first.
// - The GET calls of the API (who is signed in, the symbols, the project list, the projects) go to the network first; their last answer is
//   kept, so without a connection the last known state is shown. Signing out empties that store (see offline/offlineStore.js).
// Changes made without a connection are not this file's business: the page keeps them on the device and sends them later (offlineStore.js).
// The build fills in PRECACHE and VERSION (vite.config.js); a new version replaces the old store when it takes over.
const VERSION = '__VERSION__'
const PRECACHE = ['__PRECACHE__']
const APP_CACHE = 'plugged-app-' + VERSION
const API_CACHE = 'plugged-api'
// answers that are never kept: they only make sense live, or must never be shown from an old copy
const LIVE_ONLY = [/\/presence/, /\/qr-key$/, /^\/api\/account\/export/, /^\/api\/oauth\//, /^\/mcp/]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(APP_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key.startsWith('plugged-app-') && key !== APP_CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    )
})

const networkFirst = async (request, cacheName, fallback) => {
    try {
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(cacheName).then((cache) => cache.put(request, copy))
        }
        return response
    } catch (error) {
        const cached = (await caches.match(request)) || (fallback && (await caches.match(fallback)))
        if (cached) return cached
        throw error
    }
}

const cacheFirst = async (request) => {
    const cached = await caches.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') {
        const copy = response.clone()
        caches.open(APP_CACHE).then((cache) => cache.put(request, copy))
    }
    return response
}

self.addEventListener('fetch', (event) => {
    const request = event.request,
        url = new URL(request.url)
    if (request.method !== 'GET' || url.origin !== self.location.origin) return
    const path = url.pathname
    if (LIVE_ONLY.some((pattern) => pattern.test(path)) || path.startsWith('/oauth/') || path.startsWith('/.well-known/')) return
    if (path.startsWith('/api/')) {
        // the PDF of a QR code (no account): live only
        if (path.startsWith('/api/public/')) return
        event.respondWith(networkFirst(request, API_CACHE))
    } else if (request.mode === 'navigate') event.respondWith(networkFirst(request, APP_CACHE, '/index.html'))
    else event.respondWith(cacheFirst(request))
})
