// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The line icons of the interface (bars, buttons, badges, dialogs): one family on a 24 grid, drawn in the colour of the text (or of the theme
// variable the stylesheet gives `.ico`), instead of emoji and typographic signs that every system draws differently.
const PATHS = {
    add: ['M12 5v14M5 12h14'],
    edit: ['M15.5 4.5l4 4L9 19H5v-4z', 'M13 7l4 4'],
    duplicate: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
    earlier: ['M15 5l-7 7 7 7'],
    later: ['M9 5l7 7-7 7'],
    delete: ['M4 7h16M10 4h4M6 7l1 13h10l1-13', 'M10 11v6M14 11v6'],
    undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
    redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
    footer: ['M3 5h18v14H3z', 'M3 15h18M12 15v4'],
    info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v6M12 7.5v.01'],
    user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
    users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6'],
    power: ['M12 3v9', 'M6.3 6.3a8 8 0 1 0 11.4 0'],
    educational: ['M2 9.5 12 4.5l10 5-10 5z', 'M6 11.5v4.5c3.5 2.5 8.5 2.5 12 0v-4.5', 'M22 9.5V15'],
    close: ['M6 6l12 12M18 6L6 18'],
    star: ['M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.8l-5.25 2.8 1-5.8L3.5 9.7l5.9-.9z'],
    check: ['M5 12.5l4.5 4.5L19 7'],
    error: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 9l6 6M15 9l-6 6'],
    warning: ['M12 4 2.5 20h19z', 'M12 10v4.5M12 17.5v.01'],
    refresh: ['M20 11a8 8 0 0 0-14-5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14 5l2-2', 'M20 20v-4h-4'],
    download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    key: ['M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M11.5 11H21M18 11v3M15 11v2'],
    lock: ['M5 11h14v10H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
    home: ['M3 11l9-7 9 7', 'M5 9.5V20h14V9.5', 'M10 20v-6h4v6'],
    ruler: ['M3 15 15 3l6 6L9 21z', 'M7 11l2 2M10 8l2 2M13 5l2 2'],
    rotate: ['M4 12a8 8 0 1 0 2.3-5.7', 'M4 4v5h5'],
    heart: ['M12 20s-7.5-4.6-9-9.4C2 7 4.3 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8C19.7 4.5 22 7 21 10.6 19.5 15.4 12 20 12 20z'],
    play: ['M7 4.5v15l12-7.5z'],
    chevronDown: ['M6 9l6 6 6-6'],
    chevronRight: ['M9 6l6 6-6 6'],
    back: ['M19 12H5', 'M11 6l-6 6 6 6'],
    verify: ['M5 12.5l4.5 4.5L19 7'],
    history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4', 'M12 7v5l3 2'],
    palette: [
        'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9z',
        'M7.5 11.5v.01M10 7.5v.01M14.5 7.5v.01M17 11v.01',
    ],
}

/**
 * name: one of the icons above; size in px; filled: a solid icon (the star of a group owner); label: when the icon alone tells something
 * (an icon-only badge), its text for screen readers, else the icon is decoration.
 */
export default function Icon({name, size = 16, filled = false, label, className = ''}) {
    const paths = PATHS[name]
    if (!paths) return null
    return (
        <svg
            className={'ico' + (className ? ' ' + className : '')}
            data-icon={name}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(label ? {role: 'img', 'aria-label': label} : {'aria-hidden': true})}
        >
            {paths.map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    )
}

export const ICON_NAMES = Object.keys(PATHS)

/** A count of problems with its icon (✖ errors, ⚠ warnings) in the bars: `kind` 'error' or 'warning'. */
export function CountBadge({id, kind, count, title}) {
    return (
        <span id={id} className={'count count-' + kind} title={title}>
            <Icon name={kind} size={13} />
            {count}
        </span>
    )
}
