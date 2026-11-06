// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Eigenschappen panel of the selected element of the eendraadschema: its texts, type, properties and a toolbar to insert, move,
// duplicate, turn and delete it.
import {categoryName, EMPTY_TYPE, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {socketStackOf} from '../../symbols/symbolShapes.js'
import {CABLE_PLACEMENTS, detailLines, hasPlacement, placementLabel} from '../../model/boardLayout.js'
import {ROTATION_STEP} from '../../model/tree.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {DISTRIBUTION_TYPES, fieldRows, fieldsOf} from './elementFields.js'
import {TOOLBAR_ICONS} from './icons.jsx'
import {IconButton, PropertiesBox} from '../../components/PropertiesBox.jsx'

const fullWidth = {width: '100%', boxSizing: 'border-box'}

// The title of an insert button: what it does, or why it cannot be used.
const insertTitle = (t, possible, isEmpty, whatItDoes, whyNot) => (possible ? t(whatItDoes) : isEmpty ? t('oneWire.insert.chooseTypeFirst') : t(whyNot))

/**
 * node = the selected element. swapTypes = the types it can become (Type dropdown); canInsertBefore / canInsertAfter / canAddBranch tell which
 * insert buttons work. The handlers change the tree in OneWireDiagram.
 */
export default function PropertiesPanel({
    project,
    node,
    swapTypes,
    canInsertBefore,
    canInsertAfter,
    canAddBranch,
    onClose,
    onLabelChange,
    onTypeChange,
    onPropertyChange,
    onInfoChange,
    onInsertEmpty,
    onMoveEarlier,
    onMoveLater,
    onOutdent,
    onIndent,
    onDuplicate,
    onDelete,
    onRotate,
}) {
    const {t} = useTranslation()
    const symbolType = typeOf(project, node.type),
        properties = node.p || {},
        isEmpty = node.type === EMPTY_TYPE.k,
        isDistribution = DISTRIBUTION_TYPES.includes(node.type),
        socketStack = socketStackOf(symbolType, properties),
        swapCategories = [...new Set(swapTypes.map((candidate) => candidate.cat))]
    const shortField = ({key, label, maxLength}) => (
        <label key={key} style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <span style={{minWidth: '8.5em'}}>{t(label)}</span>
            <input
                id={'eds-field-' + key}
                value={properties[key] ?? ''}
                maxLength={maxLength}
                onChange={(event) => onPropertyChange(key, event.target.value)}
                style={{width: maxLength + 2 + 'ch', boxSizing: 'border-box', textAlign: 'center'}}
            />
        </label>
    )
    // where the cable runs (select) and whether it runs in a conduit: both are drawn left of the stem
    const placementField = ({key, label}) => (
        <div key={key} id="eds-plaatsing" style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4}}>
            <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <span>{t(label)}</span>
                <select
                    id="eds-plaatsing-select"
                    aria-label={t(label)}
                    value={properties.plaatsing ?? ''}
                    onChange={(event) => onPropertyChange('plaatsing', event.target.value)}
                >
                    {CABLE_PLACEMENTS.map((placement) => (
                        <option key={placement} value={placement}>
                            {placementLabel(placement)}
                        </option>
                    ))}
                </select>
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 4}}>
                <input
                    id="eds-inbuis"
                    type="checkbox"
                    checked={hasPlacement(properties) && !!properties.inbuis}
                    disabled={!hasPlacement(properties)}
                    onChange={(event) => onPropertyChange('inbuis', event.target.checked)}
                />
                {t('oneWire.inConduit')}
            </label>
        </div>
    )
    const wideField = ({key, label}) => (
        <label key={key}>
            {t(label)}
            <input id={'eds-field-' + key} value={properties[key] ?? ''} onChange={(event) => onPropertyChange(key, event.target.value)} style={fullWidth} />
        </label>
    )
    return (
        <PropertiesBox
            id="eds-props"
            data-tour="eds-props"
            title={t('oneWire.properties')}
            titleId="eds-props-title"
            closeId="eds-close"
            closeLabel={t('oneWire.closeProperties')}
            onClose={onClose}
        >
            <label>
                {node.type === 'kring' ? t('oneWire.letter') : t('oneWire.text')}
                <input id="eds-label" value={node.label} onChange={(event) => onLabelChange(event.target.value)} style={fullWidth} />
            </label>
            <label>
                {t('oneWire.type')}
                <select
                    id="eds-type"
                    aria-label={t('oneWire.type')}
                    value={node.type}
                    disabled={!swapTypes.length}
                    onChange={(event) => onTypeChange(event.target.value)}
                    style={fullWidth}
                >
                    {isEmpty && <option value={EMPTY_TYPE.k}>{t('oneWire.chooseSymbol')}</option>}
                    {swapTypes.length
                        ? swapCategories.map((category) => (
                              <optgroup key={category} label={categoryName(category)}>
                                  {swapTypes
                                      .filter((candidate) => candidate.cat === category)
                                      .map((candidate) => (
                                          <option key={candidate.k} value={candidate.k}>
                                              {symbolName(candidate)}
                                          </option>
                                      ))}
                              </optgroup>
                          ))
                        : !isEmpty && <option value={node.type}>{symbolName(symbolType)}</option>}
                </select>
            </label>
            {node.type === 'bord' && (
                <label>
                    <input id="eds-earthed" type="checkbox" checked={!!properties.geaard} onChange={(event) => onPropertyChange('geaard', event.target.checked)} />{' '}
                    {t('oneWire.earthed')}
                </label>
            )}
            {node.type === 'kring' && (
                <label>
                    {t('oneWire.protection')}
                    <select
                        id="eds-protection"
                        aria-label={t('oneWire.protection')}
                        value={properties.bescherming || 'automatisch'}
                        onChange={(event) => onPropertyChange('bescherming', event.target.value)}
                        style={fullWidth}
                    >
                        <option value="automatisch">{t('oneWire.protections.automatisch')}</option>
                        <option value="differentieel">{t('oneWire.protections.differentieel')}</option>
                        <option value="geen">{t('oneWire.protections.geen')}</option>
                    </select>
                </label>
            )}
            {fieldRows(fieldsOf(node)).map((row) =>
                row.short ? (
                    <div key={row.fields[0].key} id={'eds-short-' + row.fields[0].key} style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4}}>
                        {row.fields.map(shortField)}
                    </div>
                ) : (
                    row.fields.map((field) => (field.key === 'plaatsing' ? placementField(field) : wideField(field)))
                ),
            )}
            {socketStack && (
                <label>
                    <div>
                        <input id="eds-horizontal" type="checkbox" checked={socketStack.hor} onChange={(event) => onPropertyChange('hor', event.target.checked)} />{' '}
                        {t('oneWire.horizontal')}
                    </div>
                </label>
            )}
            {/* waterproof is a property of a socket (the small 'h'), not a symbol of its own; it also follows on the situatieschema */}
            {symbolType.sock && (
                <label>
                    <div>
                        <input id="eds-waterproof" type="checkbox" checked={!!properties.h} onChange={(event) => onPropertyChange('h', event.target.checked)} />{' '}
                        {t('oneWire.waterproof')}
                    </div>
                </label>
            )}
            {/* only for the symbols that have the extended details input (inverter, solar panels, battery, EV charger, or the ones where it is
                switched on in Componenten); existing details of another element stay visible so they can be edited */}
            {!isDistribution && (symbolType.details || detailLines(properties.details).length > 0) && (
                <label>
                    {t('oneWire.details')}
                    <textarea
                        id="eds-details"
                        aria-label={t('oneWire.detailsShort')}
                        rows={4}
                        placeholder={t('oneWire.detailsPlaceholder')}
                        value={properties.details ?? ''}
                        onChange={(event) => onPropertyChange('details', event.target.value)}
                        style={{...fullWidth, resize: 'vertical', fontFamily: 'inherit'}}
                    />
                    <small style={{color: '#666'}}>{t('oneWire.detailsHint')}</small>
                </label>
            )}
            {node.type !== 'kring' && (
                <input
                    id="eds-specs"
                    placeholder={t('oneWire.specsPlaceholder')}
                    aria-label={t('oneWire.specs')}
                    value={node.info || ''}
                    onChange={(event) => onInfoChange(event.target.value)}
                    style={{...fullWidth, marginTop: 4}}
                />
            )}
            <div className="tb icons" id="eds-insert">
                <small style={{display: 'block'}}>{t('oneWire.insert.label')}</small>
                <button
                    id="eds-insert-before"
                    title={insertTitle(t, canInsertBefore, isEmpty, 'oneWire.insert.beforeTitle', 'oneWire.insert.nothingFitsBefore')}
                    aria-label={t('oneWire.insert.beforeLabel')}
                    disabled={!canInsertBefore}
                    onClick={() => onInsertEmpty('before')}
                >
                    {TOOLBAR_ICONS.before} {t('oneWire.insert.before')}
                </button>
                <button
                    id="eds-insert-after"
                    title={insertTitle(t, canInsertAfter, isEmpty, 'oneWire.insert.afterTitle', 'oneWire.insert.nothingFitsAfter')}
                    aria-label={t('oneWire.insert.afterLabel')}
                    disabled={!canInsertAfter}
                    onClick={() => onInsertEmpty('after')}
                >
                    {t('oneWire.insert.after')} {TOOLBAR_ICONS.after}
                </button>
                <button
                    id="eds-insert-branch"
                    title={insertTitle(t, canAddBranch, isEmpty, 'oneWire.insert.branchTitle', 'oneWire.insert.nothingFitsBranch')}
                    aria-label={t('oneWire.insert.branchLabel')}
                    disabled={!canAddBranch}
                    onClick={() => onInsertEmpty('branch')}
                >
                    {TOOLBAR_ICONS.branch} {t('oneWire.insert.branch')}
                </button>
            </div>
            <div className="tb icons">
                <button id="eds-earlier" title={t('oneWire.toolbar.earlierTitle')} aria-label={t('oneWire.toolbar.earlier')} onClick={onMoveEarlier}>
                    {TOOLBAR_ICONS.earlier}
                </button>
                <button id="eds-later" title={t('oneWire.toolbar.laterTitle')} aria-label={t('oneWire.toolbar.later')} onClick={onMoveLater}>
                    {TOOLBAR_ICONS.later}
                </button>
                <button id="eds-outdent" title={t('oneWire.toolbar.outdentTitle')} aria-label={t('oneWire.toolbar.outdent')} onClick={onOutdent}>
                    {TOOLBAR_ICONS.outdent}
                </button>
                <button id="eds-indent" title={t('oneWire.toolbar.indentTitle')} aria-label={t('oneWire.toolbar.indent')} onClick={onIndent}>
                    {TOOLBAR_ICONS.indent}
                </button>
                <IconButton
                    id="eds-rotate-ccw"
                    icon={TOOLBAR_ICONS.counterClockwise}
                    text={ROTATION_STEP + '°'}
                    title={t('oneWire.toolbar.rotateCounterClockwiseTitle', {degrees: ROTATION_STEP})}
                    label={t('oneWire.toolbar.rotateCounterClockwise')}
                    disabled={isDistribution}
                    onClick={() => onRotate(-ROTATION_STEP)}
                />
                <IconButton
                    id="eds-rotate-cw"
                    icon={TOOLBAR_ICONS.clockwise}
                    text={ROTATION_STEP + '°'}
                    title={t('oneWire.toolbar.rotateClockwiseTitle', {degrees: ROTATION_STEP})}
                    label={t('oneWire.toolbar.rotateClockwise')}
                    disabled={isDistribution}
                    onClick={() => onRotate(ROTATION_STEP)}
                />
                <IconButton id="eds-duplicate" icon={TOOLBAR_ICONS.duplicate} title={t('oneWire.toolbar.duplicate')} onClick={onDuplicate} />
                <IconButton
                    id="eds-delete"
                    className="props-delete"
                    icon={TOOLBAR_ICONS.trash}
                    title={t('oneWire.toolbar.deleteTitle')}
                    label={t('common.delete')}
                    onClick={onDelete}
                />
                {!isDistribution && !!node.r && <small id="eds-rotation"> {node.r}°</small>}
            </div>
        </PropertiesBox>
    )
}
