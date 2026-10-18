// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, screen} from '@testing-library/react'
import Eendraad, {EenSheet} from '../Eendraad.jsx'
import {base, mount, node} from './utils.jsx'

const pal = n => screen.getAllByText(n)[0], row = n => screen.getAllByText(n).at(-1)
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {
    })
})
const withTree = tree => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree}]})
test('adds root, child; enforces hierarchy; free mode', () => {
    const {spy} = mount(Eendraad, base(), {idx: 0})
    fireEvent.click(pal('Verdeelbord'));
    expect(window.alert).toHaveBeenCalledWith('Selecteer eerst een element waaronder dit past.')
    fireEvent.click(pal('Aansluiting net'));
    expect(spy.p.een[0].tree).toHaveLength(1)
    fireEvent.click(row('Aansluiting net'));
    fireEvent.click(pal('Verdeelbord'));
    expect(spy.p.een[0].tree[0].children).toHaveLength(1)
    fireEvent.click(pal('Stopcontact'));
    expect(window.alert).toHaveBeenLastCalledWith(expect.stringContaining('kan enkel onder: Kring (automaat)'))
    fireEvent.click(screen.getByLabelText(/Vrije hiërarchie/));
    fireEvent.click(pal('Stopcontact'));
    expect(spy.p.een[0].tree[0].children[0].children).toHaveLength(1)
})
test('free mode without selection adds at root', () => {
    const {spy} = mount(Eendraad, base(), {idx: 0});
    fireEvent.click(screen.getByLabelText(/Vrije hiërarchie/));
    fireEvent.click(pal('Stopcontact'));
    expect(spy.p.een[0].tree).toHaveLength(1)
})
test('search filters palette', () => {
    const {container} = mount(Eendraad, base(), {idx: 0});
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'oven'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'zzzz'}});
    expect(container.querySelectorAll('.pal details')).toHaveLength(0)
})
test('edit properties, move, indent, outdent, duplicate, delete', () => {
    const t = [node('A', 'bord', [node('B', 'kring')]), node('C', 'bord')], {spy} = mount(Eendraad, withTree(t), {idx: 0})
    fireEvent.click(row('C'));
    fireEvent.change(screen.getByDisplayValue('C'), {target: {value: 'Cx'}});
    expect(spy.p.een[0].tree[1].label).toBe('Cx')
    fireEvent.change(screen.getByPlaceholderText(/Specs/), {target: {value: 'B16'}});
    expect(spy.p.een[0].tree[1].info).toBe('B16')
    fireEvent.click(screen.getByText('↑'));
    expect(spy.p.een[0].tree[0].label).toBe('Cx');
    fireEvent.click(screen.getByText('↓'))
    fireEvent.click(screen.getByText('→'));
    expect(spy.p.een[0].tree[0].children.map(n => n.id)).toEqual(['B', 'C'])
    fireEvent.click(screen.getByText('←'));
    expect(spy.p.een[0].tree.map(n => n.id)).toEqual(['A', 'C'])
    fireEvent.click(screen.getByText('⧉'));
    expect(spy.p.een[0].tree).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', {name: /Verwijder/}));
    expect(spy.p.een[0].tree).toHaveLength(2)
})
test('clicking a node in the diagram selects it', () => {
    const {container} = mount(Eendraad, withTree([node('A', 'bord', [], {label: 'Hoofd', info: '63A'})]), {idx: 0})
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'));
    screen.getByText('Eigenschappen');
    expect(container.querySelector('svg.sheet rect[stroke="#0a6cff"]')).toBeTruthy();
    screen.getByText('63A', {selector: 'svg text'})
})
test('custom components appear in palette', () => {
    const p = {...base(), custom: [{id: '9', name: 'Mijn ding', shapes: []}]};
    mount(Eendraad, p, {idx: 0});
    expect(pal('Mijn ding')).toBeInTheDocument()
})
test('EenSheet renders static, scales big trees', () => {
    const big = Array.from({length: 30}, (_, i) => node('n' + i, 'bord'));
    const {container} = mount(({p}) => <EenSheet p={p} pg={p.een[0]} no={1} total={1}/>, withTree(big))
    expect(container.querySelector('g[transform^="scale(0."]')).toBeTruthy()
})
test('Delete/Backspace remove the selected node; ignored in inputs and without selection', () => {
    const {spy} = mount(Eendraad, withTree([node('Aa', 'bord'), node('Bb', 'bord')]), {idx: 0}), b = document.body,
        btn = () => screen.getByRole('button', {name: /Verwijder/})
    fireEvent.keyDown(b, {key: 'Delete'});
    expect(spy.p.een[0].tree).toHaveLength(2);
    expect(btn()).toBeDisabled();
    screen.getByText(/Klik een element/)
    fireEvent.click(row('Aa'));
    screen.getByText('Selectie: Aa');
    expect(btn()).toBeEnabled();
    fireEvent.keyDown(screen.getByDisplayValue('Aa'), {key: 'Delete'});
    fireEvent.keyDown(b, {key: 'x'});
    expect(spy.p.een[0].tree).toHaveLength(2)
    fireEvent.keyDown(b, {key: 'Delete'});
    expect(spy.p.een[0].tree.map(n => n.id)).toEqual(['Bb']);
    fireEvent.click(row('Bb'));
    fireEvent.keyDown(b, {key: 'Backspace'});
    expect(spy.p.een[0].tree).toHaveLength(0)
})
test('toolbar delete button removes node with its children', () => {
    const {spy} = mount(Eendraad, withTree([node('Aa', 'bord', [node('K', 'kring')])]), {idx: 0});
    fireEvent.click(row('Aa'));
    fireEvent.click(screen.getByRole('button', {name: '🗑 Verwijder (Del)'}));
    expect(spy.p.een[0].tree).toEqual([])
})
test('footer cells in the diagram call onFooter', () => {
    const fn = vi.fn(), {container} = mount(Eendraad, base(), {idx: 0, onFooter: fn});
    fireEvent.click(container.querySelector('.fcell'));
    expect(fn).toHaveBeenCalledWith('titel')
})
