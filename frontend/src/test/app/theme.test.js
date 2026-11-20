// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The colour theme of the interface: the data-theme attribute of <html>, and a copy in the browser for the next visit.
import {applyTheme, DEFAULT_THEME, storedTheme, THEMES} from '../../app/theme.js'

afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
})

test('three themes, Marine first and the default', () => {
    expect(THEMES).toEqual(['marine', 'werkbank', 'helder'])
    expect(DEFAULT_THEME).toBe('marine')
    expect(storedTheme()).toBe('marine')
})

test('a theme is shown at once and remembered in this browser', () => {
    expect(applyTheme('werkbank')).toBe('werkbank')
    expect(document.documentElement.dataset.theme).toBe('werkbank')
    expect(storedTheme()).toBe('werkbank')
    applyTheme('helder')
    expect(document.documentElement.dataset.theme).toBe('helder')
})

test('an unknown name (an old or tampered value) gives the default', () => {
    expect(applyTheme('pink')).toBe('marine')
    expect(document.documentElement.dataset.theme).toBe('marine')
    localStorage.setItem('plugged.theme', '<b>')
    expect(storedTheme()).toBe('marine')
})

test('without storage (a private window) the theme still applies for this visit', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
    })
    expect(applyTheme('helder')).toBe('helder')
    expect(document.documentElement.dataset.theme).toBe('helder')
    setItem.mockRestore()
})
