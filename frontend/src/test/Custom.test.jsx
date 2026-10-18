// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, screen} from '@testing-library/react'
import Custom from '../Custom.jsx'
import {base, mount} from './utils.jsx'

const svg = c => c.querySelector('svg[viewBox="0 0 24 24"]'),
    clk = (s, x, y) => fireEvent.click(s, {clientX: x, clientY: y})
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {
    })
})
const save = name => {
    fireEvent.change(screen.getByPlaceholderText('Naam component'), {target: {value: name}});
    fireEvent.click(screen.getByText(/Toevoegen|Opslaan/))
}
test('draws line, circle, rect, text and saves', () => {
    const {container, spy} = mount(Custom, base());
    const s = svg(container)
    clk(s, 2, 3);
    clk(s, 10, 12);
    fireEvent.click(screen.getByText('Cirkel (midden, rand)'));
    clk(s, 12, 12);
    clk(s, 15, 16)
    fireEvent.click(screen.getByText('Rechthoek'));
    clk(s, 5, 5);
    clk(s, 9, 9);
    clk(s, 4, 4);
    clk(s, 4, 4)
    vi.spyOn(window, 'prompt').mockReturnValueOnce('X').mockReturnValueOnce(null);
    fireEvent.click(screen.getByText('Tekst'));
    clk(s, 6, 6);
    clk(s, 7, 7)
    save('Test');
    const c = spy.p.custom[0];
    expect(c.name).toBe('Test');
    expect(c.shapes.map(h => h.t)).toEqual(['line', 'circle', 'rect', 'rect', 'text'])
    expect(c.shapes[1].r).toBe(5);
    expect(c.shapes[3]).toMatchObject({w: 1, h: 1});
    screen.getByText('Test')
})
test('requires name and shape', () => {
    mount(Custom, base());
    fireEvent.click(screen.getByText('Toevoegen'));
    expect(window.alert).toHaveBeenCalled()
})
test('undo, reset, edit and delete', () => {
    const {container, spy} = mount(Custom, base());
    const s = svg(container)
    clk(s, 1, 1);
    expect(container.querySelector('circle[fill="red"]')).toBeTruthy();
    clk(s, 5, 5);
    fireEvent.click(screen.getByText('↶'));
    clk(s, 1, 1);
    clk(s, 3, 3);
    save('A');
    expect(spy.p.custom).toHaveLength(1)
    fireEvent.click(screen.getByText('✎'));
    expect(screen.getByDisplayValue('A')).toBeTruthy();
    clk(s, 8, 8);
    clk(s, 9, 9);
    save('A2');
    expect(spy.p.custom[0].name).toBe('A2');
    expect(spy.p.custom[0].shapes).toHaveLength(2)
    fireEvent.click(screen.getByText('Nieuw'));
    expect(screen.getByPlaceholderText('Naam component').value).toBe('');
    fireEvent.click(screen.getByText('✕'));
    expect(spy.p.custom).toHaveLength(0)
})
