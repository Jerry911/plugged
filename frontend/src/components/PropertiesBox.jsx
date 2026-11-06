// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Eigenschappen box of the selection, the same on the eendraadschema and the situatieschema: a title with a close button at the top
// right, what is selected below it, then the fields and the toolbar of icon buttons (IconButton) the caller puts in.

/**
 * id / titleId / closeId: the ids of the box, its title and its close button; title: the heading (Eigenschappen); subtitle (optional):
 * what is selected, with subtitleId; closeLabel: hover text of the close button; onClose: closes the box (deselects).
 */
export function PropertiesBox({id, title, titleId, subtitle, subtitleId, closeId, closeLabel, onClose, children, ...rest}) {
    return (
        <div className="warn props" id={id} {...rest}>
            <div className="props-head">
                <b id={titleId}>{title}</b>
                <button type="button" className="props-close" id={closeId} title={closeLabel} aria-label={closeLabel} onClick={onClose}>
                    ✕
                </button>
            </div>
            {subtitle && (
                <div className="props-sub" id={subtitleId}>
                    {subtitle}
                </div>
            )}
            {children}
        </div>
    )
}

/** A button of the toolbar of the Eigenschappen box: an icon, optionally a short text after it (e.g. 15°), and its hover text. */
export function IconButton({id, icon, text, title, label = title, ...rest}) {
    return (
        <button type="button" id={id} title={title} aria-label={label} {...rest}>
            {icon}
            {text && <span className="props-btn-text">{text}</span>}
        </button>
    )
}
