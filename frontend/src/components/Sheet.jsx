// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useTranslation} from '../i18n/I18nProvider.jsx'
import {MEASUREMENT_BOXES, measurementValue} from '../model/measurements.js'

/** Font size (mm) of the titles of the footer (Titel, Adres, ...): the eendraadschema is never drawn with smaller text (see MM_PER_UNIT). */
export const FOOTER_TITLE_FONT_SIZE = 2.2

const joinFilled = (parts, separator = ' ') => parts.filter((part) => part && String(part).trim()).join(separator)

/**
 * An A4 landscape sheet of 297 x 210 mm with the footer block (title block) fixed at the bottom (y 185-205).
 * With onFooter the footer cells are clickable to edit them (onFooter(fieldKey)); with a sheetId they get the ids `<sheetId>-footer-<field>`
 * (a page can show several sheets, so the ids are scoped to the sheet).
 */
export default function Sheet({project, number, total = 2, children, svgRef, onFooter, sheetId, ...svgProps}) {
    const {t} = useTranslation()
    const footer = project.footer || {}
    // [x, width, field that opens when clicked, label, value]
    const cells = [
        [5, 70, 'ean', t('sheet.cells.ean'), footer.ean],
        [75, 75, 'straat', t('sheet.cells.address'), joinFilled([joinFilled([footer.straat, footer.nr]), joinFilled([footer.postcode, footer.gemeente])], ', ')],
        [150, 50, 'eigenaar', t('sheet.cells.owner'), footer.eigenaar],
        [200, 35, 'tekenaar', t('sheet.cells.drawnBy'), footer.tekenaar],
        [235, 33, 'datum', t('sheet.cells.date'), footer.datum],
        [268, 24, 'rev', t('sheet.cells.revision'), footer.rev],
    ]
    return (
        <svg ref={svgRef} id={sheetId} {...svgProps} className="sheet" viewBox="0 0 297 210">
            <rect x="5" y="5" width="287" height="200" fill="none" stroke="#000" strokeWidth=".6" />
            {children}
            <g stroke="#000" strokeWidth=".3" fill="#000">
                <rect x="5" y="185" width="287" height="20" fill="#fff" />
                {cells.map(([x, width, field, label, value]) => (
                    <g key={field}>
                        <line x1={x} y1="185" x2={x} y2="205" />
                        <text x={x + 1} y="188.5" fontSize={FOOTER_TITLE_FONT_SIZE} fill="#666" stroke="none">
                            {label}
                        </text>
                        {value ? (
                            <text x={x + 1} y="195" fontSize="3.6" fill="#000" stroke="none">
                                {value}
                            </text>
                        ) : (
                            onFooter && (
                                <text x={x + 1} y="195" fontSize="2.8" fontStyle="italic" fill="#aaa" stroke="none">
                                    {t('sheet.clickToFill')}
                                </text>
                            )
                        )}
                        {onFooter && (
                            <rect
                                id={sheetId && `${sheetId}-footer-${field}`}
                                className="fcell"
                                x={x}
                                y="185"
                                width={width}
                                height="13"
                                stroke="none"
                                onClick={() => onFooter(field)}
                            />
                        )}
                    </g>
                ))}
                <line x1="5" y1="198" x2="292" y2="198" />
                <text x="6" y="203" fontSize="3" stroke="none">
                    {joinFilled([footer.stelsel, footer.dossier ? t('sheet.dossier', {number: footer.dossier}) : ''], ' - ')}
                </text>
                {/* the measurements for the inspection (Kaderinfo → Metingen) in the lower row under the address and the owner: always there,
                    with a dotted line to write on by hand where nothing is filled in yet (the inspector often measures them himself) */}
                <g className="sheet-measurements" stroke="none">
                    {MEASUREMENT_BOXES.map(({field, label, x, from, to, unit}) => {
                        const value = measurementValue(footer, field)
                        return (
                            <g key={field} className={'sheet-measurement' + (value ? ' filled' : '')} data-field={field}>
                                <text x={x} y="202.8" fontSize="2.6">
                                    {t(label)}
                                </text>
                                {value ? (
                                    <text className="sheet-measurement-value" x={(from + to) / 2} y="202.8" fontSize="3" textAnchor="middle">
                                        {value}
                                    </text>
                                ) : (
                                    <line className="sheet-measurement-blank" x1={from} y1="203.4" x2={to} y2="203.4" stroke="#000" strokeWidth=".2" strokeDasharray=".5 .7" />
                                )}
                                {unit && (
                                    <text x={to + 1} y="202.8" fontSize="2.6">
                                        {unit}
                                    </text>
                                )}
                            </g>
                        )
                    })}
                </g>
                {/* the scale: its own box in the lower row, under the date */}
                <text id={sheetId && sheetId + '-scale'} className="sheet-scale" x="236" y="203" fontSize="3" stroke="none">
                    <tspan fontSize={FOOTER_TITLE_FONT_SIZE} fill="#666">
                        {t('sheet.cells.scale')}
                    </tspan>{' '}
                    {footer.schaal || ''}
                </text>
                {onFooter && (
                    <rect
                        id={sheetId && `${sheetId}-footer-dossier`}
                        className="fcell"
                        x="5"
                        y="198"
                        width="230"
                        height="7"
                        stroke="none"
                        onClick={() => onFooter('dossier')}
                    />
                )}
                {onFooter &&
                    MEASUREMENT_BOXES.map(({field, cell}) => (
                        <rect
                            key={field}
                            id={sheetId && `${sheetId}-footer-${field}`}
                            className="fcell"
                            x={cell[0]}
                            y="198"
                            width={cell[1] - cell[0]}
                            height="7"
                            stroke="none"
                            onClick={() => onFooter(field)}
                        />
                    ))}
                {onFooter && (
                    <rect
                        id={sheetId && `${sheetId}-footer-schaal`}
                        data-tour="sheet-scale"
                        className="fcell"
                        x="235"
                        y="198"
                        width="33"
                        height="7"
                        stroke="none"
                        onClick={() => onFooter('schaal')}
                    />
                )}
                <text id={sheetId && sheetId + '-number'} className="sheet-number" x="286" y="203" fontSize="3" textAnchor="end" stroke="none">
                    {t('sheet.pageOf', {number, total})}
                </text>
            </g>
        </svg>
    )
}
