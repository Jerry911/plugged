// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The tools of the situatieschema and the bedradingsschema as a narrow column of icons on the drawing (like drawing programs do): the
// name, the shortcut key and a short help of a tool show when the mouse is on it (or the keyboard focus), and a button folds the column
// away when it is in the way of the drawing.
import {useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

const ICONS = {
    select: <path d="M6 3.5l12 6.8-5.6 1.4-2.6 5.3z" />,
    wall: <path d="M3 10h18v4H3z" fill="currentColor" />,
    room: (
        <>
            <path d="M4 5h16v14H4z" />
            <path d="M4 12h7" />
        </>
    ),
    door: (
        <>
            <path d="M5 20V5" />
            <path d="M5 5a15 15 0 0 1 15 15" />
            <path d="M2 20h3M20 20h2" />
        </>
    ),
    window: <path d="M3 9h18M3 15h18M3 9v6M21 9v6M12 9v6" />,
    sym: (
        <>
            <path d="M15 6a6 6 0 0 0 0 12" />
            <path d="M9 12H3" />
        </>
    ),
    text: (
        <>
            <path d="M5 7V4h14v3" />
            <path d="M12 4v16M9 20h6" />
        </>
    ),
    erase: (
        <>
            <path d="M15.5 3.5l5 5L10 19H5.5L3 16.5z" />
            <path d="M9 10l5 5" />
            <path d="M10 19h11" />
        </>
    ),
    wire: (
        <>
            <circle cx="5" cy="18" r="2" />
            <circle cx="19" cy="6" r="2" />
            <path d="M5 16V8h14" />
        </>
    ),
    box: <path d="M4 5h16v14H4z" strokeDasharray="4 2.5" />,
    template: (
        <>
            <path d="M3 11l9-7 9 7" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M10 20v-6h4v6" />
        </>
    ),
    // the drawing tools of a component (Componenten)
    line: <path d="M5 19L19 5" />,
    circle: <circle cx="12" cy="12" r="8" />,
    rect: <path d="M4 6h16v12H4z" />,
    arc: <path d="M4 16a8 8 0 0 1 16 0z" />,
    pins: (
        <>
            <path d="M3 12h5M16 12h5" />
            <circle cx="12" cy="12" r="3.2" />
        </>
    ),
    fold: <path d="M15 6l-6 6 6 6" />,
    unfold: <path d="M9 6l6 6-6 6" />,
}

export const ToolIcon = ({name, size = 20}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {ICONS[name]}
    </svg>
)

// whether the column is folded away is remembered in this browser (for both tabs)
const FOLDED_KEY = 'plugged.toolRailFolded'
const readFolded = () => {
    try {
        return localStorage.getItem(FOLDED_KEY) === '1'
    } catch {
        return false
    }
}

/** The shortcut key of a tool in the active language (one letter, upper case). */
export const toolKey = (t, name) => t('situation.toolKeys.' + name).toUpperCase()

/**
 * The tool of a key press, or undefined: a single letter without Ctrl, Alt or Cmd, not while typing in a field. tools = the tools of the
 * tab; the letters come from the language (situation.toolKeys).
 */
export const toolOfKey = (event, tools, t) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.key?.length !== 1) return undefined
    if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable) return undefined
    return tools.find((name) => toolKey(t, name) === event.key.toUpperCase())
}

/**
 * prefix = 'sit', 'wire' or 'comp' (the ids); tools = the tools in their order (null = a separator); tool / onTool = the active one; extra =
 * {id, label, title, onClick, disabled}: the button under the tools (a starter template, a plan to copy). The name, key and help of a tool
 * come from situation.* unless `texts` = {name, key, help} (functions of the tool; key and help may answer null). `docked`: the rail stands
 * beside the drawing instead of on it (the component editor), without the fold button.
 */
export default function ToolRail({prefix, tools, tool, onTool, extra, texts, docked = false}) {
    const {t} = useTranslation()
    const nameOf = texts?.name ?? ((name) => t('situation.tools.' + name)),
        keyOf = texts?.key ?? ((name) => toolKey(t, name)),
        helpOf = texts?.help ?? ((name) => t('situation.toolHelp.' + name))
    const [storedFolded, setFolded] = useState(readFolded),
        folded = !docked && storedFolded
    useEffect(() => {
        try {
            localStorage.setItem(FOLDED_KEY, storedFolded ? '1' : '0')
        } catch {
            // no storage (private window): it is only for this visit
        }
    }, [storedFolded])
    const tip = (label, key, help) => (
        <span className="railtip" aria-hidden="true">
            <span className="railtip-head">
                {label}
                {key && <kbd>{key}</kbd>}
            </span>
            {help && <span className="railtip-help">{help}</span>}
        </span>
    )
    return (
        <div
            className={'ui toolrail' + (folded ? ' folded' : '') + (docked ? ' docked' : '')}
            id={prefix + '-tools'}
            role="toolbar"
            aria-orientation="vertical"
            aria-label={t('situation.rail.label')}
        >
            {!docked && (
                <button
                    id={prefix + '-rail-toggle'}
                    className="railbtn railfold"
                    aria-expanded={!folded}
                    aria-label={folded ? t('situation.rail.unfold') : t('situation.rail.fold')}
                    onClick={() => setFolded(!folded)}
                >
                    {folded ? (
                        <>
                            <ToolIcon name={tool} size={18} />
                            <ToolIcon name="unfold" size={14} />
                        </>
                    ) : (
                        <ToolIcon name="fold" size={18} />
                    )}
                    {tip(folded ? t('situation.rail.unfold') : t('situation.rail.fold'))}
                </button>
            )}
            {!folded &&
                tools.map((name, index) =>
                    name ? (
                        <button
                            key={name}
                            id={prefix + '-tool-' + name}
                            className={'railbtn' + (tool === name ? ' on' : '')}
                            aria-pressed={tool === name}
                            aria-label={nameOf(name)}
                            aria-keyshortcuts={keyOf(name) || undefined}
                            data-tour={docked ? undefined : 'tool-' + name}
                            onClick={() => onTool(name)}
                        >
                            <ToolIcon name={name} />
                            {tip(nameOf(name), keyOf(name), helpOf(name))}
                        </button>
                    ) : (
                        <span key={'sep' + index} className="railsep" />
                    ),
                )}
            {!folded && extra && (
                <>
                    <span className="railsep" />
                    <button id={extra.id} className="railbtn railextra" aria-label={extra.label} disabled={extra.disabled} onClick={extra.onClick}>
                        <ToolIcon name="template" />
                        {tip(extra.title || extra.label)}
                    </button>
                </>
            )}
        </div>
    )
}
