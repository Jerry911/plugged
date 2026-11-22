// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The IEC 60617 symbols of the bedradingsschema (keys iec_*): only on the bedradingsschema, named in every language, drawn on the grid.
import catalog from '../fixtures/standardSymbols.js'
import nl from '../../i18n/locales/nl.js'
import fr from '../../i18n/locales/fr.js'
import en from '../../i18n/locales/en.js'
import {inOneWire, inWiring, symbolPins} from '../../model/wiring.js'

const iec = catalog.filter((symbol) => symbol.k.startsWith('iec_'))

test('the catalog ships the IEC 60617 symbols, each only on the bedradingsschema', () => {
    expect(iec.length).toBeGreaterThan(450)
    iec.forEach((symbol) => {
        expect(inWiring(symbol), symbol.k).toBe(true)
        expect(inOneWire(symbol), symbol.k).toBe(false)
        expect(symbol.place, symbol.k).toBe(false)
    })
})

test('every standard symbol and every category has a name in Dutch, French and English; the Dutch one is the name the catalog stores', () => {
    catalog.forEach((symbol) => {
        ;[nl, fr, en].forEach((language) => expect(language.symbols[symbol.k], symbol.k).toBeTruthy())
        expect(nl.symbols[symbol.k], symbol.k).toBe(symbol.name)
        ;[nl, fr, en].forEach((language) => expect(language.categories[symbol.cat], symbol.cat).toBeTruthy())
    })
})

test('the connection points of an IEC symbol lie on the grid of 24 and are not all in the middle when it has leads', () => {
    iec.forEach((symbol) => {
        const pins = symbolPins(symbol)
        expect(pins.length, symbol.k).toBeGreaterThan(0)
        pins.forEach(([x, y]) => {
            expect(x >= 0 && x <= 24 && y >= 0 && y <= 24, symbol.k + ' ' + [x, y]).toBe(true)
        })
    })
    // the contacts connect at the top and the bottom
    expect(symbolPins(catalog.find((symbol) => symbol.k === 'iec_13_03_v'))).toEqual(expect.arrayContaining([[12, 0], [12, 24]]))
})

test('the stay-put variants carry the detent: a V under the linkage', () => {
    const stayPut = catalog.filter((symbol) => /standhoudend/.test(symbol.name) && symbol.k.endsWith('_v'))
    expect(stayPut.length).toBeGreaterThanOrEqual(3)
    stayPut.forEach((symbol) => {
        const vee = symbol.shapes.filter((shape) => shape.t === 'line' && shape.y2 > 12 && shape.y1 === 12)
        expect(vee.length, symbol.k).toBeGreaterThan(0)
    })
})
