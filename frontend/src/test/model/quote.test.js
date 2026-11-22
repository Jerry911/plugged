// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The offerte: elements to articles, cover frames from the combinations on the plan, protection and cables from the materiaallijst.
import {cableKey, newPriceList, normalizePriceList, protectionMatches, protectionSpecs} from '../../model/pricing.js'
import {frameNeeds, quoteOf} from '../../model/quote.js'

const node = (id, type, children = [], extra = {}) => ({id, type, label: '', info: '', children, ...extra})

/** Circuit A: 3 sockets and a double socket on 2,5 mm²; circuit B: a switch and a light point; the sockets s1-s3 on the plan. */
const project = (items = []) => ({
    footer: {schaal: '1:50'},
    een: [
        {
            id: 'e1',
            name: 'Blad 1',
            tree: [
                node('net', 'aansluiting', [
                    node('bord', 'bord', [
                        node('A', 'kring', [node('s1', 'stopcontact_pekid'), node('s2', 'stopcontact_pekid'), node('s3', 'stopcontact_pekid'), node('d', 'stopcontact2')], {
                            label: 'A',
                            p: {polen: '2', amp: '20', curve: 'B', kabel: 'XVB 3G2,5', bescherming: 'automatisch', lengte: '17,2'},
                        }),
                        node('B', 'kring', [node('sw', 'schakelaar', [node('l', 'lichtpunt')])], {
                            label: 'B',
                            p: {polen: '2', amp: '16', curve: 'B', kabel: 'XVB 3G1,5', bescherming: 'automatisch'},
                        }),
                    ]),
                ], {p: {bescherming: 'differentieel', polen: '2', amp: '40', delta: '300', diffType: 'A'}}),
            ],
        },
    ],
    sit: [{id: 'p1', name: 'Plan', walls: [], items}],
})
const priced = () => {
    const list = newPriceList()
    list.articles = list.articles.map((article) => ({...article, price: '2,00'}))
    list.labour.hourly = '60'
    return list
}
const line = (quote, article) => quote.lines.find((candidate) => candidate.article === article)

test('the specs of a protective device are read from a short text and only what is given must match', () => {
    expect(protectionSpecs('2P B16')).toEqual({poles: '2', curve: 'B', amp: '16'})
    expect(protectionSpecs('4P 40A 300mA type A 10kA')).toEqual({poles: '4', amp: '40', delta: '300', diffType: 'A', kA: '10'})
    const device = {kind: 'automatisch', poles: '2', amp: '16', curve: 'B', delta: '', diffType: '', kA: '3'}
    expect(protectionMatches({protection: {kind: 'automatisch', match: '2P B16'}}, device)).toBe(true)
    expect(protectionMatches({protection: {kind: 'automatisch', match: 'B20'}}, device)).toBe(false)
    expect(protectionMatches({protection: {kind: 'differentieel', match: ''}}, device)).toBe(false)
    expect(cableKey('XVB-F2 3G2.5 mm²')).toBe(cableKey('xvb 3g2,5'))
})

test('the standard price list only refers to its own articles; a stored one is completed', () => {
    const list = newPriceList(),
        ids = new Set(list.articles.map((article) => article.id))
    for (const recipe of Object.values(list.symbols)) for (const part of recipe.parts) expect(ids.has(part.article)).toBe(true)
    for (const direction of ['h', 'v']) for (const article of Object.values(list.frames[direction])) expect(ids.has(article)).toBe(true)
    expect(normalizePriceList({articles: [{id: 'x'}, null], vat: 7})).toMatchObject({articles: [{id: 'x'}], vat: 21, margin: 0, frames: {h: {}, v: {}, box: ''}})
})

test('cover frames: one per element, combined ones share one in their direction, the rest horizontal', () => {
    const list = newPriceList()
    expect(frameNeeds(project(), list)).toEqual([
        {places: 1, direction: 'h', count: 4},
        {places: 2, direction: 'h', count: 1},
    ])
    const plan = [
        {id: 'i1', kind: 'sym', node: 's1', combo: 'c', dir: 'v'},
        {id: 'i2', kind: 'sym', node: 's2', combo: 'c', dir: 'v'},
        {id: 'i3', kind: 'sym', node: 'd', combo: 'c', dir: 'v'},
        {id: 'i4', kind: 'sym', node: 's3', dir: 'v'},
    ]
    // s1 + s2 + the double socket = 4 places vertical; s3 alone vertical; the switch (not on the plan) horizontal
    expect(frameNeeds(project(plan), list)).toEqual([
        {places: 1, direction: 'h', count: 1},
        {places: 1, direction: 'v', count: 1},
        {places: 4, direction: 'v', count: 1},
    ])
})

test('the offerte: articles of the elements, frames and boxes, protection, cables per metre, labour, margin and VAT', () => {
    const plan = [
        {id: 'i1', kind: 'sym', node: 's1', combo: 'c'},
        {id: 'i2', kind: 'sym', node: 's2', combo: 'c'},
        {id: 'i3', kind: 'sym', node: 's3', combo: 'c'},
    ]
    const quote = quoteOf(project(plan), priced(), {margin: 10, vat: 6})
    // 3 single sockets + the 2 of the double one
    expect(line(quote, 'socket').qty).toBe(5)
    expect(line(quote, 'plateSocket').qty).toBe(5)
    expect(line(quote, 'frame3h').qty).toBe(1)
    expect(line(quote, 'frame2h').qty).toBe(1)
    expect(line(quote, 'frame1').qty).toBe(1)
    // a box per place: 3 + 2 + 1 (the switch)
    expect(line(quote, 'box').qty).toBe(6)
    expect(line(quote, 'breakerB20').qty).toBe(1)
    expect(line(quote, 'breakerB16').qty).toBe(1)
    expect(line(quote, 'diff300').qty).toBe(1)
    expect(line(quote, 'board').qty).toBe(1)
    // 17,2 m rounded up
    expect(line(quote, 'xvb3g25').qty).toBe(18)
    expect(line(quote, 'socket')).toMatchObject({cost: 2, price: 2.2, total: 11})
    expect(quote.labour.rate).toBe(60)
    expect(quote.labour.hours * 4).toBe(Math.ceil(quote.labour.minutes / 15))
    expect(quote.vat.rate).toBe(6)
    expect(quote.subtotal).toBeCloseTo(quote.material + quote.labour.total, 2)
    expect(quote.total).toBeCloseTo(quote.subtotal * 1.06, 1)
    // circuit B has no length: said so, not guessed
    expect(quote.problems).toContainEqual({kind: 'cableLength', cable: 'XVB 3G1,5', circuits: 1})
})

test('what cannot be priced is listed: no articles, no price, no frame that large, no matching protection, no hourly rate', () => {
    const list = newPriceList()
    delete list.symbols.lichtpunt
    list.frames.h = {1: 'frame1'}
    list.articles = list.articles.filter((article) => article.id !== 'breakerB20')
    const quote = quoteOf(project([{id: 'x', kind: 'sym', node: 's1', combo: 'c'}, {id: 'y', kind: 'sym', node: 'd', combo: 'c'}]), list, {extras: [{text: 'Keuring', qty: 1, price: '150'}, {text: ''}]})
    const kinds = quote.problems.map((problem) => problem.kind)
    expect(kinds).toEqual(expect.arrayContaining(['noArticles', 'noPrice', 'noFrame', 'noProtection', 'noHourly']))
    expect(quote.problems.find((problem) => problem.kind === 'noFrame')).toMatchObject({places: 3, direction: 'h', count: 1})
    expect(quote.extras).toEqual([{text: 'Keuring', qty: 1, price: 150, total: 150}])
    expect(quote.subtotal).toBe(150)
    expect(quote.vat.rate).toBe(21)
    expect(quoteOf(project(), list, {labour: false}).problems.map((problem) => problem.kind)).not.toContain('noHourly')
})
