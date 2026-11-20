// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The colour theme of the interface: Marine (the default), Werkbank (dark) or Helder (light), chosen per user in Account → Mijn account and
// stored on the server (GET/PUT /api/account/theme). This browser keeps a copy, so the right colours show at once on the next visit, before
// the user signs in. The theme is the data-theme attribute of <html>; the colours are in styles/theme.css.
export const THEMES = ['marine', 'werkbank', 'helder']
export const DEFAULT_THEME = 'marine'
const STORAGE_KEY = 'plugged.theme'

/** The theme this browser used last, or the default. */
export const storedTheme = () => {
    try {
        const theme = localStorage.getItem(STORAGE_KEY)
        return THEMES.includes(theme) ? theme : DEFAULT_THEME
    } catch {
        return DEFAULT_THEME
    }
}

/** Shows the interface in this theme (an unknown name: the default) and remembers it in this browser; answers the theme it applied. */
export const applyTheme = (name) => {
    const theme = THEMES.includes(name) ? name : DEFAULT_THEME
    document.documentElement.dataset.theme = theme
    try {
        localStorage.setItem(STORAGE_KEY, theme)
    } catch {
        // no storage (private window): only for this visit
    }
    return theme
}
