// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useCallback, useRef, useState} from 'react'

export const WINDOW = 500, LIMIT = 100 // changes < WINDOW ms apart (typing, dragging) share one undo step
export function useHistory(init) {
    const cur = useRef(init), past = useRef([]), fut = useRef([]), last = useRef(0), [st, setSt] = useState({
        p: init,
        u: false,
        r: false
    })
    const sync = () => setSt({p: cur.current, u: past.current.length > 0, r: fut.current.length > 0})
    const setP = useCallback(next => {
        const n = typeof next === 'function' ? next(cur.current) : next;
        if (n === cur.current) return
        const t = Date.now();
        if (t - last.current > WINDOW) {
            past.current.push(cur.current);
            if (past.current.length > LIMIT) past.current.shift()
        }
        last.current = t;
        fut.current = [];
        cur.current = n;
        sync()
    }, [])
    const undo = useCallback(() => {
        if (!past.current.length) return;
        fut.current.push(cur.current);
        cur.current = past.current.pop();
        last.current = 0;
        sync()
    }, [])
    const redo = useCallback(() => {
        if (!fut.current.length) return;
        past.current.push(cur.current);
        cur.current = fut.current.pop();
        last.current = 0;
        sync()
    }, [])
    const reset = useCallback(n => {
        cur.current = n;
        past.current = [];
        fut.current = [];
        last.current = 0;
        sync()
    }, [])
    return {p: st.p, setP, undo, redo, reset, canUndo: st.u, canRedo: st.r}
}
