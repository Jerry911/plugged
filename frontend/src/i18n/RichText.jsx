// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Translations stay plain strings; a little markup gives them emphasis:
//   **bold**   -> <b>bold</b>
//   [[Ctrl]]   -> <kbd>Ctrl</kbd>
//   \n         -> a line break
// A text with paragraphs is a list of strings: every string is one <p>.
const TOKEN = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\n)/g

export const renderInline = (text) =>
    String(text)
        .split(TOKEN)
        .filter((part) => part !== '')
        .map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) return <b key={index}>{part.slice(2, -2)}</b>
            if (part.startsWith('[[') && part.endsWith(']]')) return <kbd key={index}>{part.slice(2, -2)}</kbd>
            if (part === '\n') return <br key={index} />
            return part
        })

/** One paragraph per string of `text` (a string or a list of strings). */
export default function RichText({text}) {
    const paragraphs = Array.isArray(text) ? text : [text]
    return (
        <>
            {paragraphs.map((paragraph, index) => (
                <p key={index}>{renderInline(paragraph)}</p>
            ))}
        </>
    )
}
