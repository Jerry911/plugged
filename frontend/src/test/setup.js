// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import '@testing-library/jest-dom/vitest'
import standard from './fixtures/standard-symbols.json'
import {setLibrary} from '../symbols/symbolLibrary.js'
import {setLanguage} from '../i18n/translate.js'
// The symbols come from the backend. The tests use the standard symbols of the backend catalog (generated from StandardSymbols.java,
// see StandardSymbolsJson in the backend tests) as the active library.
setLibrary(standard)
beforeEach(() => {
    // Users that have seen the guided tour: the tests of the editor are not interrupted by it (the tour tests call forgetTour). The tour is
    // remembered per user (plugged.tour.<id>); the tests sign in as one of the users with ids 1 to 9.
    for (let id = 1; id < 10; id++) localStorage.setItem('plugged.tour.' + id, JSON.stringify({v: 99, how: 'test'}))
    // The tests find elements by id and compare texts with t(): they run in Dutch unless a test switches the language itself
    setLanguage('nl')
})
// jsdom lacks SVG geometry + PointerEvent: minimal polyfills so clientX/clientY map 1:1 to SVG user units.
const svgPrototype = window.SVGSVGElement.prototype
svgPrototype.createSVGPoint = function () {
    return {
        x: 0,
        y: 0,
        matrixTransform() {
            return {x: this.x, y: this.y}
        },
    }
}
svgPrototype.getScreenCTM = function () {
    return {inverse: () => ({})}
}
if (!window.PointerEvent) {
    window.PointerEvent = class extends MouseEvent {}
}
