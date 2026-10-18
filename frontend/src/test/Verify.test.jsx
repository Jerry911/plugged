// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import Verify from '../Verify.jsx'

const iss = [{id: '1', level: 'error', rule: 'earth', msg: 'Geen aarding'}, {
    id: '2',
    level: 'warn',
    rule: 'x',
    msg: 'Let op',
    nodeId: 'n',
    pageName: 'Blad 2',
    page: 1
}, {id: '3', level: 'info', rule: 'spd', msg: 'Hint'}]
test('lists issues with counts, navigates and closes', () => {
    const go = vi.fn(), close = vi.fn();
    render(<Verify issues={iss} onGo={go} onClose={close}/>)
    screen.getByText('1 fouten · 1 waarschuwingen · 1 opmerkingen');
    screen.getByText('— Blad 2');
    expect(screen.queryByText(/Geen fouten/)).toBeNull()
    fireEvent.click(screen.getByText('Let op', {exact: false}));
    expect(go).toHaveBeenCalledWith(iss[1]);
    fireEvent.click(screen.getByText('Sluiten'));
    expect(close).toHaveBeenCalled()
})
test('shows success state only for info/no issues', () => {
    render(<Verify issues={[iss[2]]} onGo={() => {
    }} onClose={() => {
    }}/>);
    screen.getByText('✓ Geen fouten of waarschuwingen gevonden')
})
