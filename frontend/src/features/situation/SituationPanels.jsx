// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The panels around the situatieschema drawing: the component palette on the left and the "nergens geplaatst" list on the right.
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {categoryName, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {placedShapesOf} from '../../symbols/symbolShapes.js'
import {nodeName} from '../../model/project.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {forwardRef} from 'react'
import {toDomId} from '../../components/domId.js'
import Icon from '../../components/Icon.jsx'
import {SYMBOL_SCALE} from './SituationSheet.jsx'

/** One component as a button: symbol, name on the left, marking (e.g. A7) aligned right. */
export const ComponentButton = ({project, node, name, mark, id, active, title, onClick}) => (
    <button id={id} type="button" className={'compbtn' + (active ? ' on' : '')} title={title} onClick={onClick}>
        <svg className="symtile" width="20" height="20" viewBox="0 0 20 20" style={{flex: 'none'}}>
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

/**
 * The searchable list of general library components that can be placed loose on the drawing. grouped (the bedradingsschema, some 580
 * symbols): one folding group per category, in the order of symbolTypes; the first one open, all of them while searching.
 */
/**
 * The symbols to place, with a search field and the ones used last. symbolScale / onSymbolScale: how big the symbols of this sheet are drawn
 * (the plan; null on the bedradingsschema, which draws them at their own size).
 */
export function ComponentPalette({project, symbolTypes, placedCount, search, onSearch, activeType, onChoose, grouped = false, recent = [], symbolScale = null, onSymbolScale}) {
    const {t} = useTranslation()
    const button = (symbolType) => (
        <ComponentButton
            key={symbolType.k}
            project={project}
            node={{type: symbolType.k}}
            name={symbolName(symbolType)}
            title={symbolName(symbolType)}
            id={'comp-' + toDomId(symbolType.k)}
            active={activeType === symbolType.k}
            onClick={() => onChoose(symbolType.k)}
        />
    )
    const categories = grouped ? [...new Set(symbolTypes.map((symbolType) => symbolType.cat || ''))] : []
    return (
        <div className="pal fill-grow fill-col" data-tour="comp-palette" id="sit-palette">
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
            {symbolScale != null && (
                <label className="symbolsize" title={t('situation.symbolSizeTitle')}>
                    {t('situation.symbolSize')}
                    <input
                        id="sit-symbol-size"
                        type="range"
                        min={SYMBOL_SCALE.min}
                        max={SYMBOL_SCALE.max}
                        step={SYMBOL_SCALE.step}
                        value={symbolScale}
                        onChange={(event) => onSymbolScale(+event.target.value)}
                    />
                    <span id="sit-symbol-size-value">{Math.round(symbolScale * 100)}%</span>
                </label>
            )}
            {/* the symbols used last on this tab: one tap to place them again */}
            {!search && recent.length > 0 && (
                <div id="comp-recent" className="recentstrip" aria-label={t('situation.recent')}>
                    {recent.map((key) => {
                        const symbolType = typeOf(project, key)
                        return (
                            <button
                                key={key}
                                id={'comp-recent-' + toDomId(key)}
                                type="button"
                                className={activeType === key ? 'on' : ''}
                                title={symbolName(symbolType)}
                                aria-label={symbolName(symbolType)}
                                onClick={() => onChoose(key)}
                            >
                                <svg width="22" height="22" viewBox="0 0 22 22">
                                    <SymbolGraphic shapes={placedShapesOf(symbolType)} x={11} y={11} size={20} />
                                </svg>
                            </button>
                        )
                    })}
                </div>
            )}
            <div className="pallist fill-grow">
                {grouped
                    ? categories.map((category, index) => {
                          const inCategory = symbolTypes.filter((symbolType) => (symbolType.cat || '') === category)
                          return (
                              <details key={category} id={'comp-category-' + toDomId(category || '-')} className="palgroup" open={!!search || index === 0}>
                                  <summary>
                                      <b>{categoryName(category)}</b> <span className="palcount">{inCategory.length}</span>
                                  </summary>
                                  {inCategory.map(button)}
                              </details>
                          )
                      })
                    : symbolTypes.map(button)}
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
 * The elements of the eendraadschema that are not on the plan yet: click one to place it. Shown neutrally (`neutral`: a student in educational mode, or a user who switched the rule plan.unplaced off) it is
 * the same list without any judgement: no warning styling or title, no counts and no "all placed" check (see App.jsx).
 */
export const UnplacedPanel = forwardRef(function UnplacedPanel(
    {project, unplaced, hidden, marks, open, onToggleOpen, showHidden, onToggleShowHidden, onPlace, onPlaceAll, onSetHidden, neutral, looseCircuitSymbols = 0, onGenerate},
    ref,
) {
    const {t} = useTranslation()
    return (
        <div id="sit-unplaced-panel" ref={ref} className={'rightpanel ui sticky-side fill' + (open ? '' : ' closed')} data-tour="unplaced">
            <button
                id="sit-unplaced-toggle"
                className="paneltoggle"
                aria-label={open ? t('situation.unplacedCollapse') : t('situation.unplacedOpen')}
                title={open ? t('situation.collapse') : neutral ? t('situation.elementsOpen') : t('situation.unplacedOpenCount', {count: unplaced.length})}
                onClick={onToggleOpen}
            >
                {open ? '>' : '<'}
                {/* on a narrow screen the toggle is a bar under the drawing: it says what it opens */}
                <span className="paneltoggle-text">{open ? t('situation.unplacedCollapse') : t('situation.unplacedOpen')}</span>
                {!open && !neutral && unplaced.length > 0 && <span className="badge">{unplaced.length}</span>}
            </button>
            {open && (
                <>
                    {looseCircuitSymbols > 0 && onGenerate && (
                        <div className="genbox" id="sit-generate-box">
                            <span>{t('generate.panelText', {count: looseCircuitSymbols})}</span>
                            <button type="button" id="sit-generate" className="accent" onClick={onGenerate}>
                                <Icon name="add" /> {t('generate.button')}
                            </button>
                        </div>
                    )}
                    {unplaced.length ? (
                        <div className={(neutral ? 'neutral' : 'warn') + ' fill-grow fill-col'} id="sit-unplaced">
                            <span id="sit-unplaced-title">{neutral ? (
                                    t('situation.elementsTitle')
                                ) : (
                                    <>
                                        <Icon name="warning" /> {t('situation.unplacedTitle', {count: unplaced.length})}
                                    </>
                                )}</span>
                            <div className="pal unplist fill-grow">
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
                                {neutral ? t('situation.placeAllNeutral') : t('situation.placeAll')}
                            </button>
                            <div className="unhint">{t('situation.hideHint')}</div>
                        </div>
                    ) : neutral ? (
                        <div className="neutral" id="sit-nothing-to-place">
                            {t('situation.nothingToPlace')}
                        </div>
                    ) : (
                        <div className="ok" id="sit-all-placed">
                            <Icon name="check" /> {t('situation.allPlaced')}
                        </div>
                    )}
                    {hidden.length > 0 && (
                        <div className="hiddenlist">
                            <button id="toggle-hidden" className="toggle" aria-expanded={showHidden} onClick={onToggleShowHidden}>
                                <Icon name={showHidden ? 'chevronDown' : 'chevronRight'} /> {t('situation.hiddenTitle', {count: hidden.length})}
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
})
