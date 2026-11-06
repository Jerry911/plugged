// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Opbouw list: the whole tree of the page, one row per element. Main levels (distribution parts) are bold and can be folded.
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {placedShapesOf} from '../../symbols/symbolShapes.js'
import {typeOf} from '../../symbols/symbolLibrary.js'
import {nodeName} from '../../model/project.js'
import {flatten} from '../../model/tree.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {DISTRIBUTION_TYPES} from './elementFields.js'
import {TreeMarker} from './icons.jsx'

const toggleStyle = {
    display: 'inline-flex',
    width: 14,
    height: 14,
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'inherit',
    cursor: 'pointer',
}

export default function StructureTree({project, tree, selectedId, onSelect, folded, onToggleFold}) {
    const {t} = useTranslation()
    const rows = (nodes, depth = 0) =>
        nodes.flatMap((node) => {
            const hasChildren = node.children.length > 0,
                open = !folded.has(node.id),
                isMainLevel = DISTRIBUTION_TYPES.includes(node.type),
                hiddenCount = hasChildren ? flatten(node.children).length : 0
            return [
                <div
                    key={node.id}
                    id={'eds-tree-' + node.id}
                    className={selectedId === node.id ? 'sel' : ''}
                    style={{paddingLeft: depth * 10 + 2, cursor: 'pointer'}}
                    onClick={() => onSelect(node.id)}
                >
                    <span style={{display: 'inline-flex', width: 14, flex: 'none'}}>
                        {hasChildren ? (
                            <button
                                id={`eds-toggle-${node.id}`}
                                title={open ? t('oneWire.collapse') : t('oneWire.expandHidden', {count: hiddenCount})}
                                aria-label={open ? t('oneWire.collapse') : t('oneWire.expand')}
                                aria-expanded={open}
                                style={toggleStyle}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onToggleFold(node.id)
                                }}
                            >
                                <TreeMarker kind={!open ? 'closed' : isMainLevel && depth > 0 ? 'main' : 'open'} />
                            </button>
                        ) : (
                            isMainLevel &&
                            depth > 0 && (
                                <span style={{opacity: 0.45, display: 'inline-flex'}}>
                                    <TreeMarker kind="main" />
                                </span>
                            )
                        )}
                    </span>
                    <svg width="20" height="20" viewBox="0 0 22 22">
                        <SymbolGraphic shapes={placedShapesOf(typeOf(project, node.type), node.p)} x={11} y={11} size={20} />
                    </svg>
                    <span className="tree-name" style={isMainLevel ? {fontWeight: 600} : undefined}>
                        {nodeName(project, node)}
                    </span>
                    <small style={{color: '#666'}}>{node.info}</small>
                    {!open && <small style={{color: '#666'}}>(+{hiddenCount})</small>}
                </div>,
                ...(open ? rows(node.children, depth + 1) : []),
            ]
        })
    return (
        <div id="eds-tree" className="tree fill-grow">
            {rows(tree)}
        </div>
    )
}
