// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The palette of the eendraadschema: all symbols per category, searchable. Click a symbol to add it, or drag it onto the drawing.
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {categoryName, symbolName} from '../../symbols/symbolLibrary.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {toDomId} from '../../components/domId.js'

export default function SymbolPalette({symbolTypes, search, onSearch, free, onFreeChange, onAdd, onDragStart, onDragEnd}) {
    const {t} = useTranslation()
    const categories = [...new Set(symbolTypes.map((symbolType) => symbolType.cat))],
        searchText = search.toLowerCase()
    return (
        <>
            <input
                id="eds-palette-search"
                placeholder={t('oneWire.searchElement')}
                aria-label={t('oneWire.searchElement')}
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                style={{width: '100%', boxSizing: 'border-box'}}
            />
            <label>
                <input id="eds-free-hierarchy" type="checkbox" checked={free} onChange={(event) => onFreeChange(event.target.checked)} />{' '}
                {t('oneWire.freeHierarchy')}
            </label>
            {categories.map((category) => {
                const matching = symbolTypes.filter((symbolType) => symbolType.cat === category && symbolName(symbolType).toLowerCase().includes(searchText))
                return (
                    matching.length > 0 && (
                        <details key={category} id={'eds-category-' + toDomId(category)} open={!!search}>
                            <summary>
                                <b>{categoryName(category)}</b>
                            </summary>
                            {matching.map((symbolType) => (
                                <button
                                    key={symbolType.k}
                                    id={'eds-palette-' + toDomId(symbolType.k)}
                                    data-tour={'pal-' + symbolType.k}
                                    draggable
                                    title={t('oneWire.paletteHint')}
                                    onClick={() => onAdd(symbolType)}
                                    onDragStart={(event) => {
                                        onDragStart(symbolType)
                                        if (event.dataTransfer) {
                                            event.dataTransfer.effectAllowed = 'copy'
                                            event.dataTransfer.setData('text/plain', symbolType.k)
                                        }
                                    }}
                                    onDragEnd={onDragEnd}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20">
                                        <SymbolGraphic shapes={symbolType.shapes} x={10} y={10} size={18} />
                                    </svg>
                                    {symbolName(symbolType)}
                                </button>
                            ))}
                        </details>
                    )
                )
            })}
        </>
    )
}
