// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Project documents for the tests (same shape as the ones in the unit tests) and a few helpers to build them.
import pako from 'pako'

export const node = (id, type, children = [], extra = {}) => ({id, type, label: id, info: '', children, ...extra})
export const project = (over = {}) => ({
    footer: {titel: 'Testproject', datum: '2026-01-01', schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: 'Blad 1', tree: [node('A', 'aansluiting', [node('B', 'bord')], {label: 'Aansluiting net'})]}],
    sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: []}],
    custom: [],
    ...over,
})
// a small but complete board: connection, board, one circuit with a socket and a light
export const withCircuit = (over = {}) =>
    project({
        een: [
            {
                id: 'e1',
                name: 'Hoofd',
                tree: [
                    node('A', 'aansluiting', [
                        node('B', 'bord', [node('K', 'kring', [node('S', 'stopcontact', [], {label: 'Keuken stopcontact'}), node('L', 'lichtpunt', [], {label: 'Gang licht'})], {info: 'B16 2,5mm²', p: {}})], {label: 'Verdeelbord'}),
                    ], {label: 'Aansluiting net'}),
                ],
            },
        ],
        ...over,
    })
// a schema with problems for the verifier (no differential, no earth, ...)
export const flawed = () =>
    project({
        een: [
            {
                id: 'a',
                name: 'Hoofd',
                tree: [node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'stopcontact')], {info: 'B16 2,5mm²'})])])],
            },
        ],
        footer: {},
    })
// project in the format before the multi-sheet model (tree + plan), it is migrated when loaded
export const oldFormat = () => ({
    footer: {titel: 'Oud'},
    tree: [node('n', 'stopcontact', [], {label: 'Oud sc'})],
    plan: {walls: [], items: [{id: 'i', kind: 'door', a: 30, x: 1, y: 1}]},
})
// a .eds file (Eendraadschema.be format): "EDS0040000" + base64(deflate(json))
const row = (id, parent, type, props = {}) => ({id, parent, indent: 0, props: {type, ...props}})
export const edsFile = ({unknown = true} = {}) => {
    const data = [
        row(1, 0, 'Aansluiting', {met_teller: true}),
        row(2, 1, 'Bord', {is_geaard: true}),
        row(3, 2, 'Kring', {naam: 'A', amperage: '16', aantal_polen: '2', type_kabel: 'XVB Cca 3G2,5'}),
        row(4, 3, 'Contactdoos', {adres: 'Keuken'}),
        ...(unknown ? [row(5, 3, 'Rare')] : []),
    ]
    const json = JSON.stringify({data, properties: {owner: 'Jan<br>Dorpstraat 1<br>9000 Gent'}})
    return 'EDS0040000' + Buffer.from(pako.deflate(json)).toString('base64')
}
// a correct schema: no errors or warnings (meter, differential, earthing, every element placed on the plan)
export const correct = () => {
    const tree = [
        node('A', 'aansluiting', [
            node('T', 'teller', [
                node('B', 'bord', [
                    node(
                        'D',
                        'diff',
                        [
                            node('K1', 'kring', [node('S1', 'stopcontact_pekid'), node('S2', 'stopcontact2')], {info: 'B16 XVB Cca 3G2,5', p: {plaatsing: 'inwand'}}),
                            node('K2', 'kring', [node('SW', 'schakelaar', [node('L1', 'lichtpunt')])], {info: 'B10 XVB Cca 3G1,5', p: {plaatsing: 'inwand'}}),
                        ],
                        {info: '40A 30mA type A'},
                    ),
                    node('E', 'aarding'),
                ]),
            ]),
        ]),
    ]
    const ids = (ns) => ns.flatMap((n) => [n.id, ...ids(n.children)])
    return project({
        // everything the AREI asks on the schema (3.1.2)
        footer: {titel: 'Woning', straat: 'Kerkstraat', nr: '12', postcode: '9000', gemeente: 'Gent', eigenaar: 'Jan', tekenaar: 'Piet', stelsel: '2x230V TT', rev: 'A', datum: '2026-01-01'},
        een: [{id: 'e1', name: 'Blad 1', tree}],
        sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: ids(tree).map((id) => ({id: 'i' + id, kind: 'sym', node: id, x: 1, y: 1}))}],
    })
}
