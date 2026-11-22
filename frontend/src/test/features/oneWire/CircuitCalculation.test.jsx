// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The calculation block of a circuit in its Eigenschappen, and the button that names a circuit after the rooms of its points.
import {fireEvent, render} from '@testing-library/react'
import CircuitCalculation from '../../../features/oneWire/CircuitCalculation.jsx'
import PropertiesPanel from '../../../features/oneWire/PropertiesPanel.jsx'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById, node} from '../../utils.jsx'

const circuit = (p = {}) => node('K1', 'kring', [node('s1', 'stopcontact')], {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB 3G2,5', tekst: '', ...p}})
const projectWith = (kring, items = []) => ({
    ...baseProject(),
    een: [{id: 'e1', name: 'Blad 1', tree: [node('B', 'bord', [kring])]}],
    sit: [{id: 's1', name: 'Plan 1', walls: [], items}],
})

test('with the estimate from the plan it shows the length as a hint and the drop and short-circuit results', () => {
    const kring = circuit(),
        project = projectWith(kring, [{id: 'b', kind: 'sym', type: 'bord', node: 'B', x: 0, y: 0}, {id: 'p', kind: 'sym', type: 'stopcontact', node: 's1', x: 100, y: 0}])
    render(<CircuitCalculation project={project} node={kring} onPropertyChange={() => {}} />)
    // 1,5 + 5 + 1,5 m
    expect(getById('eds-field-lengte').placeholder).toBe(t('calc.estimate', {metres: '8,0'}))
    expect(getById('eds-calc-drop').className).toBe('good')
    expect(getById('eds-calc-short').className).toBe('good')
    expect(byId('eds-calc-unknown')).toBeNull()
    expect(getById('eds-calc-assumptions').textContent).toContain(t('calc.indicative'))
})

test('a typed length that is too long marks both results; without a length only the maximum length is shown', () => {
    const long = circuit({lengte: '200'}),
        changes = []
    const {unmount} = render(<CircuitCalculation project={projectWith(long)} node={long} onPropertyChange={(key, value) => changes.push([key, value])} />)
    expect(getById('eds-calc-drop').className).toBe('bad')
    expect(getById('eds-calc-short').className).toBe('bad')
    fireEvent.change(getById('eds-field-lengte'), {target: {value: '20'}})
    expect(changes).toEqual([['lengte', '20']])
    unmount()
    const bare = circuit()
    render(<CircuitCalculation project={projectWith(bare)} node={bare} onPropertyChange={() => {}} />)
    expect(getById('eds-calc-unknown')).toBeTruthy()
    expect(getById('eds-calc-max').textContent).toBe(t('calc.maxLength', {breaker: 'B16', section: '2,5', metres: '135'}))
})

test('without a cable section there is nothing to calculate', () => {
    const kring = circuit({kabel: ''})
    render(<CircuitCalculation project={projectWith(kring)} node={kring} onPropertyChange={() => {}} />)
    expect(getById('eds-calc-none').textContent).toBe(t('calc.needsSpecs'))
})

test('the circuit can take the names of the rooms its points are drawn in', () => {
    const wall = (x1, y1, x2, y2) => ({id: [x1, y1, x2, y2].join(), x1, y1, x2, y2}),
        kring = circuit(),
        project = projectWith(kring, [{id: 'p', kind: 'sym', type: 'stopcontact', node: 's1', x: 10, y: 10}, {id: 'l', kind: 'text', x: 20, y: 20, txt: 'Keuken', s: 3}])
    project.sit[0].walls = [wall(0, 0, 40, 0), wall(40, 0, 40, 40), wall(40, 40, 0, 40), wall(0, 40, 0, 0)]
    const changes = [],
        noop = () => {}
    render(
        <PropertiesPanel
            project={project}
            node={kring}
            swapTypes={[]}
            onClose={noop}
            onLabelChange={noop}
            onTypeChange={noop}
            onPropertyChange={(key, value) => changes.push([key, value])}
            onInfoChange={noop}
        />,
    )
    fireEvent.click(getById('eds-rooms'))
    expect(changes).toEqual([['tekst', 'Keuken']])
})
