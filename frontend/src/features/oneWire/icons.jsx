// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Small line icons for the toolbar buttons of the Eigenschappen boxes of the eendraadschema and the situatieschema (stroke follows the
// text colour).
const LineIcon = ({children}) => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
)

export const TOOLBAR_ICONS = {
    // move to an earlier / later position among the elements of the same group
    earlier: (
        <LineIcon>
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
        </LineIcon>
    ),
    later: (
        <LineIcon>
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
        </LineIcon>
    ),
    // one level up (out of its group) / one level down (into the previous element)
    outdent: (
        <LineIcon>
            <path d="M21 6H11" />
            <path d="M21 12h-6" />
            <path d="M21 18H11" />
            <path d="M7 8l-4 4 4 4" />
        </LineIcon>
    ),
    indent: (
        <LineIcon>
            <path d="M21 6H11" />
            <path d="M21 12h-6" />
            <path d="M21 18H11" />
            <path d="M3 8l4 4-4 4" />
        </LineIcon>
    ),
    counterClockwise: (
        <LineIcon>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
        </LineIcon>
    ),
    trash: (
        <LineIcon>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </LineIcon>
    ),
    clockwise: (
        <LineIcon>
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
        </LineIcon>
    ),
    // a quarter turn clockwise: a quarter of a circle with the arrow at its end
    quarterTurn: (
        <LineIcon>
            <path d="M5 19V12a7 7 0 0 1 7-7h6" />
            <path d="M15 2l3 3-3 3" />
        </LineIcon>
    ),
    // mirror left-right: a dashed axis standing up with a half triangle on each side
    mirror: (
        <LineIcon>
            <path d="M12 3v18" strokeDasharray="2 2.5" />
            <path d="M9 7L3 17h6z" />
            <path d="M15 7l6 10h-6z" />
        </LineIcon>
    ),
    // mirror top-bottom (a door opens to the other side of its wall): the same, turned a quarter
    flip: (
        <LineIcon>
            <path d="M3 12h18" strokeDasharray="2 2.5" />
            <path d="M7 9L17 3v6z" />
            <path d="M7 15l10 6v-6z" />
        </LineIcon>
    ),
    duplicate: (
        <LineIcon>
            <rect x="8" y="8" width="13" height="13" rx="2" />
            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </LineIcon>
    ),
    // insert an empty symbol before / after the selected one: a box (the symbol) with a plus at the side where the new one comes
    before: (
        <LineIcon>
            <rect x="13" y="6" width="8" height="12" rx="1" />
            <path d="M3 12h7" />
            <path d="M6.5 8.5v7" />
        </LineIcon>
    ),
    after: (
        <LineIcon>
            <rect x="3" y="6" width="8" height="12" rx="1" />
            <path d="M14 12h7" />
            <path d="M17.5 8.5v7" />
        </LineIcon>
    ),
    // the next branch: a stem with the existing branch (a box) below and a plus on the new branch above it
    branch: (
        <LineIcon>
            <path d="M5 3v18" />
            <path d="M5 18h5" />
            <rect x="10" y="15" width="9" height="6" rx="1" />
            <path d="M5 7h5" />
            <path d="M14.5 4v6" />
            <path d="M11.5 7h6" />
        </LineIcon>
    ),
}

/** Markers of the Opbouw list: 'main' = arrow of a main level (distribution part) under its parent, 'open' / 'closed' = fold state. */
export const TreeMarker = ({kind}) => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor" stroke="none">
        {kind === 'main' && (
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v7h7" />
                <path d="M7.5 5.5L10.5 9l-3 3.5" />
            </g>
        )}
        {kind === 'open' && <path d="M3 5l4 5 4-5z" />}
        {kind === 'closed' && <path d="M5 3l5 4-5 4z" />}
    </svg>
)
