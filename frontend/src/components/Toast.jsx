// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Feedback such as "Automatisch opgeslagen om 16:13 ✓" as a toast at the bottom right of the page, so the top bar stays one row.
// The message stays in the page (#status-message, for screen readers and tests) and only fades out: it does not catch clicks.
import {useCallback, useEffect, useState} from 'react'

/** How long a message stays: longer messages a little longer (3 to 8 s). */
export const toastDuration = (text) => Math.min(8000, 3000 + 40 * String(text || '').length)

/**
 * The state of the toast: [text, setText]. setText takes a text or a function of the current text (like setState), and every call
 * shows the toast again, also when the text is the same as before (a second "Automatisch opgeslagen" in the same minute).
 */
export function useToast() {
    const [toast, setToast] = useState({text: '', shown: 0})
    const show = useCallback(
        (value) =>
            setToast((current) => {
                const text = typeof value === 'function' ? value(current.text) : value
                return {text, shown: current.shown + 1}
            }),
        [],
    )
    return [toast, show]
}

export default function Toast({toast}) {
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        if (!toast.text) return setVisible(false)
        setVisible(true)
        const timer = setTimeout(() => setVisible(false), toastDuration(toast.text))
        return () => clearTimeout(timer)
    }, [toast])
    return (
        <div className={'toast' + (visible ? ' shown' : '')} role="status" aria-live="polite">
            <span id="status-message">{toast.text}</span>
        </div>
    )
}
