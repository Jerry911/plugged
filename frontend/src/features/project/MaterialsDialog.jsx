// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Project → Materiaallijst: the bill of materials of the open project (see model/materials.js), to read and to download as Excel or CSV.
import {useMemo} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {billOfMaterials} from '../../model/materials.js'
import {download, materialsCsv, materialsFileName, materialsXlsx} from './materialsExport.js'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function Section({id, title, columns, rows}) {
    const {t} = useTranslation()
    if (!rows.length) return null
    return (
        <section>
            <h3>{t('materials.sections.' + title)}</h3>
            <table id={id} className="plist matlist">
                <thead>
                    <tr>
                        {columns.map(([key]) => (
                            <th key={key}>{t('materials.columns.' + key)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            {columns.map(([key, value]) => (
                                <td key={key} className={key === 'count' || key === 'outlets' ? 'num' : undefined}>
                                    {value(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}

export default function MaterialsDialog({project, projectId, onClose}) {
    const {t, language} = useTranslation()
    // the names of the kinds are in the active language
    const bom = useMemo(() => billOfMaterials(project), [project, language])
    const empty = !bom.protection.length && !bom.cables.length && !bom.elements.length && !bom.boards.length
    return (
        <div id="materials-dialog" className="dlg ui materialsdlg" role="dialog" aria-label={t('materials.title')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
            <div className="tb">
                <b>{t('materials.title')}</b>
                <button id="materials-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                    ✕
                </button>
            </div>
            <p style={{margin: '6px 0'}}>{t('materials.intro', {count: bom.circuits})}</p>
            {empty ? (
                <p id="materials-empty">{t('materials.empty')}</p>
            ) : (
                <div className="matbody">
                    <Section id="materials-protection" title="protection" rows={bom.protection} columns={[['article', (row) => row.description], ['count', (row) => row.count], ['circuits', (row) => row.marks]]} />
                    <Section id="materials-cables" title="cables" rows={bom.cables} columns={[['cable', (row) => row.cable], ['count', (row) => row.count], ['circuits', (row) => row.marks]]} />
                    <Section id="materials-elements" title="elements" rows={bom.elements} columns={[['element', (row) => row.name], ['count', (row) => row.count], ['outlets', (row) => row.outlets || '']]} />
                    {bom.outlets > 0 && (
                        <p id="materials-outlets">
                            <b>{t('materials.totalOutlets')}:</b> {bom.outlets}
                        </p>
                    )}
                    <Section id="materials-boards" title="boards" rows={bom.boards} columns={[['element', (row) => row.name], ['count', (row) => row.count]]} />
                    <p className="pm-note">{t('materials.cableLengthNote')}</p>
                </div>
            )}
            <div className="tb" style={{marginTop: 8}}>
                <button id="materials-xlsx" className="accent" disabled={empty} onClick={() => download(materialsXlsx(bom, project), materialsFileName(project, projectId, 'xlsx'), XLSX_TYPE)}>
                    {t('materials.downloadXlsx')}
                </button>{' '}
                <button id="materials-csv" disabled={empty} onClick={() => download(materialsCsv(bom, project), materialsFileName(project, projectId, 'csv'), 'text/csv;charset=utf-8')}>
                    {t('materials.downloadCsv')}
                </button>
            </div>
        </div>
    )
}
