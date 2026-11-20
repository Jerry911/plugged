// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Situatieschema → Sjabloon: choose the floor plan of a standard home to start from (model/planTemplates.js). Every template shows a
// preview of its floors, its size, the scale it is drawn at and where it goes: on this sheet when it is empty, else on new sheets.
// A template that needs a larger scale changes the scale of the project, but only while nothing is drawn yet (the scale of a drawing that
// exists would change its real dimensions); else it cannot be chosen.
import {useEffect, useRef} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {PLAN_TEMPLATES, bestScaleForTemplate, hasDrawing, roomWalls, scaleForTemplate} from '../../model/planTemplates.js'
import {scaleOf} from '../../model/geometry.js'
import {getLocale} from '../../i18n/translate.js'
import Icon from '../../components/Icon.jsx'

const metres = (value) => value.toLocaleString(getLocale())

/** A small drawing of one floor: its walls and room names (metres). */
function FloorPreview({floor, template}) {
    const {t} = useTranslation()
    const margin = 0.3
    return (
        <svg className="tplfloor" viewBox={`${-margin} ${-margin} ${template.w + 2 * margin} ${template.h + 2 * margin}`} role="img" aria-label={t('templates.floors.' + floor.name)}>
            {floor.rooms.map((room) => (
                <text key={room.name + room.x + room.y} x={room.x + room.w / 2} y={room.y + room.h / 2} fontSize={Math.min(0.42, room.w / 5)} textAnchor="middle" dominantBaseline="middle">
                    {t('templates.rooms.' + room.name)}
                </text>
            ))}
            {roomWalls(floor.rooms, floor.passages).map((wall, index) => (
                <line key={index} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
            ))}
        </svg>
    )
}

/**
 * What choosing a template would do in this project: {scale (null: does not fit at all), changesScale, blocked, placement (text)}.
 * While nothing is drawn (situatieschema or bedradingsschema: the scale is the one of the whole project) the template gets the scale at
 * which it fills the sheet best, larger or smaller than the current one; with a drawing the scale stays, or the template cannot be used.
 * Exported for the tests.
 */
export const templateChoice = (template, project, pageIndex, t) => {
    const scale = scaleOf(project.footer),
        anyDrawing = hasDrawing(project.sit) || (project.wire || []).some((page) => hasDrawing([page]) || page.wires?.length || page.boxes?.length),
        needed = anyDrawing ? scaleForTemplate(template, scale) : bestScaleForTemplate(template),
        pageEmpty = !hasDrawing([project.sit[pageIndex]]),
        changesScale = needed != null && needed !== scale,
        blocked = needed == null || (changesScale && anyDrawing),
        floors = template.floors.length
    const placement = !pageEmpty
        ? t('templates.newPages', {count: floors})
        : floors > 1
          ? t('templates.thisPageAndNew', {count: floors - 1})
          : t('templates.thisPage')
    return {scale: needed, changesScale, blocked, placement}
}

/** `project`, `pageIndex` the sheet the user is on; `onChoose(template, scale)`; `onClose()`. */
export default function TemplateDialog({project, pageIndex, onChoose, onClose}) {
    const {t} = useTranslation()
    const dialog = useRef(null)
    useEffect(() => dialog.current?.querySelector('button.accent:not(:disabled)')?.focus(), [])
    const currentScale = scaleOf(project.footer)
    return (
        <div
            id="template-dialog"
            ref={dialog}
            className="dlg ui templatedlg"
            role="dialog"
            aria-label={t('templates.title')}
            onKeyDown={(event) => event.key === 'Escape' && onClose()}
        >
            <div className="tb">
                <b>{t('templates.title')}</b>
                <button id="template-close" className="sheetInfoBtn" title={t('templates.close')} onClick={onClose}>
                    <Icon name="close" />
                </button>
            </div>
            <p className="tplintro">{t('templates.intro')}</p>
            <div className="tplgrid">
                {PLAN_TEMPLATES.map((template) => {
                    const choice = templateChoice(template, project, pageIndex, t)
                    return (
                        <section key={template.id} id={'template-' + template.id} className={'tplcard' + (choice.blocked ? ' blocked' : '')}>
                            <h3>{t('templates.names.' + template.id)}</h3>
                            <div className="tplfloors">
                                {template.floors.map((floor) => (
                                    <figure key={floor.name}>
                                        <FloorPreview floor={floor} template={template} />
                                        {template.floors.length > 1 && <figcaption>{t('templates.floors.' + floor.name)}</figcaption>}
                                    </figure>
                                ))}
                            </div>
                            <p className="tpldesc">{t('templates.descriptions.' + template.id)}</p>
                            <p className="tplfacts">
                                {t('templates.size', {w: metres(template.w), h: metres(template.h)})} ·{' '}
                                {template.floors.length === 1 ? t('templates.floorOne') : t('templates.floorCount', {count: template.floors.length})}
                            </p>
                            <p className={'tplscale' + (choice.blocked ? ' error' : choice.changesScale ? ' warn' : '')} id={'template-' + template.id + '-scale'}>
                                {choice.blocked
                                    ? t('templates.blocked', {scale: currentScale})
                                    : choice.changesScale
                                      ? t('templates.changesScale', {scale: choice.scale})
                                      : t('templates.fits', {scale: choice.scale})}
                            </p>
                            {!choice.blocked && <p className="tplplace">{choice.placement}</p>}
                            <button id={'template-' + template.id + '-use'} className="accent" disabled={choice.blocked} onClick={() => onChoose(template, choice.scale)}>
                                {t('templates.use')}
                            </button>
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
