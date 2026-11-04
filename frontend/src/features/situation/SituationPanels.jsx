// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The panels around the situatieschema drawing: the component palette on the left and the "nergens geplaatst" list on the right.
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {categoryName, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {placedShapesOf} from '../../symbols/symbolShapes.js'
import {nodeName} from '../../model/project.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {toDomId} from '../../components/domId.js'

/** One component as a button: symbol, name on the left, marking (e.g. A7) aligned right. */
export const ComponentButton = ({project, node, name, mark, id, active, title, onClick}) => (
    <button id={id} type="button" className="compbtn" title={title} style={active ? {background: '#cfe3ff'} : undefined} onClick={onClick}>
        <svg width="20" height="20" viewBox="0 0 20 20" style={{flex: 'none'}}>
            <SymbolGraphic shapes={placedShapesOf(typeOf(project, node.type), node.p)} x={10} y={10} size={18} />
        </svg>
        <span className="nm">{name ?? nodeName(project, node)}</span>
        {mark && <span className="mark">{mark}</span>}
    </button>
)

/** Does a symbol type match the search? Every word must occur in its name or category (in the active language). */
export const matchesSearch = (symbolType, search) => {
    const haystack = [symbolName(symbolType), categoryName(symbolType.cat || '')].join(' ').toLowerCase()
    return search
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word))
}

/** The searchable list of general library components that can be placed loose on the drawing. */
export function ComponentPalette({project, symbolTypes, placedCount, search, onSearch, activeType, onChoose}) {
    const {t} = useTranslation()
    return (
        <div className="pal" data-tour="comp-palette" id="sit-palette">
            <b>{t('situation.components', {count: placedCount})}</b>
            <input
                id="comp-filter"
                type="search"
                aria-label={t('situation.searchComponentLabel')}
                placeholder={t('situation.searchComponent')}
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                style={{width: '100%', boxSizing: 'border-box', margin: '4px 0'}}
            />
            <div className="pallist">
                {symbolTypes.map((symbolType) => (
                    <ComponentButton
                        key={symbolType.k}
                        project={project}
                        node={{type: symbolType.k}}
                        name={symbolName(symbolType)}
                        id={'comp-' + toDomId(symbolType.k)}
                        active={activeType === symbolType.k}
                        onClick={() => onChoose(symbolType.k)}
                    />
                ))}
                {!symbolTypes.length && <i id="comp-none">{t('situation.noComponentsFound')}</i>}
            </div>
        </div>
    )
}

const HideIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3l18 18" />
        <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4M6.4 6.4A17.7 17.7 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.2-.9" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
)
const ShowIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
)

/**
 * The right panel: the elements of the eendraadschema that are on no plan yet (click one to place it), the button that places all of them,
 * and the elements the user marked as not needed on the situatieschema.
 */
/**
 * The elements of the eendraadschema that are not on the plan yet: click one to place it. In educational mode (`educational`, a student) it is
 * the same list without any judgement: no warning styling or title, no counts and no "all placed" check (see App.jsx).
 */
export function UnplacedPanel({project, unplaced, hidden, marks, open, onToggleOpen, showHidden, onToggleShowHidden, onPlace, onPlaceAll, onSetHidden, educational}) {
    const {t} = useTranslation()
    return (
        <div id="sit-unplaced-panel" className={'rightpanel ui' + (open ? '' : ' closed')} data-tour="unplaced">
            <button
                id="sit-unplaced-toggle"
                className="paneltoggle"
                aria-label={open ? t('situation.unplacedCollapse') : t('situation.unplacedOpen')}
                title={open ? t('situation.collapse') : educational ? t('situation.elementsOpen') : t('situation.unplacedOpenCount', {count: unplaced.length})}
                onClick={onToggleOpen}
            >
                {open ? '>' : '<'}
                {!open && !educational && unplaced.length > 0 && <span className="badge">{unplaced.length}</span>}
            </button>
            {open && (
                <>
                    {unplaced.length ? (
                        <div className={educational ? 'neutral' : 'warn'} id="sit-unplaced">
                            <span id="sit-unplaced-title">{educational ? t('situation.elementsTitle') : '⚠ ' + t('situation.unplacedTitle', {count: unplaced.length})}</span>
                            <div className="pal unplist">
                                {unplaced.map((node) => (
                                    <div key={node.id} className="unprow">
                                        <ComponentButton
                                            project={project}
                                            node={node}
                                            id={'unplaced-' + node.id}
                                            mark={marks.get(node.id)}
                                            title={t('situation.clickToPlace')}
                                            onClick={() => onPlace(node.id)}
                                        />
                                        <button
                                            type="button"
                                            className="iconbtn hide"
                                            id={'hide-' + node.id}
                                            title={t('situation.hideTitle')}
                                            aria-label={t('situation.hide', {name: nodeName(project, node)})}
                                            onClick={() => onSetHidden(node.id, true)}
                                        >
                                            <HideIcon />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button id="sit-place-all" onClick={onPlaceAll}>
                                {educational ? t('situation.placeAllNeutral') : t('situation.placeAll')}
                            </button>
                            <div className="unhint">{t('situation.hideHint')}</div>
                        </div>
                    ) : educational ? (
                        <div className="neutral" id="sit-nothing-to-place">
                            {t('situation.nothingToPlace')}
                        </div>
                    ) : (
                        <div className="ok" id="sit-all-placed">
                            ✓ {t('situation.allPlaced')}
                        </div>
                    )}
                    {hidden.length > 0 && (
                        <div className="hiddenlist">
                            <button id="toggle-hidden" className="toggle" aria-expanded={showHidden} onClick={onToggleShowHidden}>
                                {showHidden ? '▾' : '▸'} {t('situation.hiddenTitle', {count: hidden.length})}
                            </button>
                            {showHidden && (
                                <div className="pal unplist">
                                    <div className="hint">{t('situation.hiddenHint')}</div>
                                    {hidden.map((node) => (
                                        <div key={node.id} className="unprow">
                                            <ComponentButton project={project} node={node} id={'hidden-' + node.id} mark={marks.get(node.id)} />
                                            <button
                                                type="button"
                                                className="iconbtn show"
                                                id={'unhide-' + node.id}
                                                title={t('situation.showTitle')}
                                                aria-label={t('situation.show', {name: nodeName(project, node)})}
                                                onClick={() => onSetHidden(node.id, false)}
                                            >
                                                <ShowIcon />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
