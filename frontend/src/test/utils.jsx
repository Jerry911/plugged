// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useState} from 'react'
import {render} from '@testing-library/react'

export const base = () => ({
    footer: {titel: 'T', datum: '2026-01-01', schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: 'Blad 1', tree: []}],
    sit: [{id: 's1', name: 'Plan 1', walls: [], items: []}],
    custom: []
})
export const node = (id, type, children = [], extra = {}) => ({id, type, label: id, info: '', children, ...extra})
const Harness = ({C, init, spy, ...props}) => {
    const [p, setP] = useState(init);
    spy.p = p;
    return <C p={p} setP={setP} {...props}/>
}
export const mount = (C, init, props = {}) => {
    const spy = {};
    return {...render(<Harness C={C} init={init} spy={spy} {...props}/>), spy}
}
