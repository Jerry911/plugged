// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import '@testing-library/jest-dom/vitest'
import standard from './fixtures/standard-symbols.json'
import {setLibrary} from '../symbols'
// The symbols come from the backend. The tests use the standard symbols of the backend catalog (generated from StandardSymbols.java,
// see StandardSymbolsJson in the backend tests) as the active library.
setLibrary(standard)
// jsdom lacks SVG geometry + PointerEvent: minimal polyfills so clientX/clientY map 1:1 to SVG user units.
const P = window.SVGSVGElement.prototype
P.createSVGPoint = function () {
    return {
        x: 0, y: 0, matrixTransform() {
            return {x: this.x, y: this.y}
        }
    }
}
P.getScreenCTM = function () {
    return {inverse: () => ({})}
}
if (!window.PointerEvent) {
    window.PointerEvent = class extends MouseEvent {
    }
}
