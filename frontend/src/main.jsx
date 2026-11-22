// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {createRoot} from 'react-dom/client'
import App from './app/App.jsx'
import './styles/index.css'
import {applyTheme, storedTheme} from './app/theme.js'

// the colours of the last visit at once, before the user signs in and his own theme comes from the server
applyTheme(storedTheme())

createRoot(document.getElementById('root')).render(<App />)

// the PWA: the service worker keeps the application opening without a connection (src/offline/sw.js, made by the build)
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
