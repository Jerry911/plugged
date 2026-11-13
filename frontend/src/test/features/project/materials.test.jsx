// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render} from '@testing-library/react'
import {strFromU8, unzipSync} from 'fflate'
import {billOfMaterials} from '../../../model/materials.js'
import {materialsCsv, materialsFileName, materialsRows, materialsXlsx} from '../../../features/project/materialsExport.js'
import MaterialsDialog from '../../../features/project/MaterialsDialog.jsx'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById, node} from '../../utils.jsx'

const kring = (id, kids = [], p = {}) => node(id, 'kring', kids, {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, bescherming: 'automatisch', ...p}})
const project = () => {
    const p = baseProject()
    p.name = 'Woning Jan'
    p.footer = {...p.footer, eigenaar: 'Jan; "de" Smet', straat: 'Dorp', nr: '5', postcode: '9000', gemeente: 'Gent'}
    p.een[0].tree = [node('B', 'bord', [kring('K1', [node('S', 'stopcontact', [], {p: {aantal: 2}})]), kring('K2', [node('L', 'lichtpunt')], {amp: 10})])]
    return p
}

test('the rows: title, project, then the sections with their headers', () => {
    const p = project(),
        rows = materialsRows(billOfMaterials(p), p)
    expect(rows[0]).toEqual({style: 'title', cells: [t('materials.title') + ' - Woning Jan']})
    expect(rows.find((row) => row.cells[1] === 'Dorp 5, 9000 Gent')).toBeTruthy()
    const sections = rows.filter((row) => row.style === 'section').map((row) => row.cells[0])
    expect(sections).toEqual(['protection', 'cables', 'elements', 'boards'].map((key) => t('materials.sections.' + key)))
    expect(rows.find((row) => row.cells[0] === 'XVB Cca 3G2,5').cells).toEqual(['XVB Cca 3G2,5', 2, 'K1, K2', ''])
    expect(rows.find((row) => row.cells[0] === t('materials.totalOutlets')).cells[2]).toBe(2)
})
test('CSV: byte order mark, semicolons, quoted where needed', () => {
    const p = project(),
        csv = materialsCsv(billOfMaterials(p), p)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('\r\n' + t('materials.kinds.automatisch') + ' 2P B16 3 kA;1;K1\r\n')
    expect(csv).toContain(';"Jan; ""de"" Smet"\r\n')
})
test('xlsx: a zip with a workbook and a sheet holding the rows', () => {
    const p = project(),
        files = unzipSync(materialsXlsx(billOfMaterials(p), p))
    expect(Object.keys(files).sort()).toEqual(
        ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    )
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<t xml:space="preserve">XVB Cca 3G2,5</t>')
    expect(sheet).toContain('Jan; &quot;de&quot; Smet')
    expect(sheet).toMatch(/<c r="B\d+"( s="\d")?><v>2<\/v><\/c>/)
    expect(strFromU8(files['xl/workbook.xml'])).toContain(t('materials.sheetName'))
    for (const content of Object.values(files)) new DOMParser().parseFromString(strFromU8(content), 'application/xml').querySelector('parsererror') === null || expect.fail('invalid XML')
})
test('the file name comes from the project name, else the title or number', () => {
    expect(materialsFileName({name: 'Woning Jan / Gent'}, 7, 'csv')).toBe(t('materials.fileName') + '-Woning-Jan-Gent.csv')
    expect(materialsFileName({footer: {}}, 7, 'xlsx')).toBe(t('materials.fileName') + '-7.xlsx')
})
test('the dialog shows the tables and downloads both files', () => {
    const created = [],
        onClose = vi.fn()
    URL.createObjectURL = vi.fn((blob) => (created.push(blob), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<MaterialsDialog project={project()} projectId={3} onClose={onClose} />)
    expect(getById('materials-protection').querySelectorAll('tbody tr')).toHaveLength(2)
    expect(getById('materials-cables')).toHaveTextContent('XVB Cca 3G2,5')
    expect(getById('materials-outlets')).toHaveTextContent('2')
    expect(byId('materials-empty')).toBeNull()
    fireEvent.click(getById('materials-xlsx'))
    fireEvent.click(getById('materials-csv'))
    expect(click).toHaveBeenCalledTimes(2)
    expect(created.map((blob) => blob.type)).toEqual(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv;charset=utf-8'])
    fireEvent.keyDown(getById('materials-csv'), {key: 'Escape'})
    expect(onClose).toHaveBeenCalled()
    click.mockRestore()
})
test('an empty drawing: a note and no downloads', () => {
    render(<MaterialsDialog project={baseProject()} onClose={() => {}} />)
    expect(getById('materials-empty')).toHaveTextContent(t('materials.empty'))
    expect(getById('materials-xlsx')).toBeDisabled()
    expect(getById('materials-csv')).toBeDisabled()
})
test('every text exists in every language', async () => {
    const {setLanguage} = await import('../../../i18n/translate.js')
    const keys = ['menu', 'menuTitle', 'title', 'empty', 'sheetName', 'fileName', 'connection', 'circuits', 'waterproof', 'totalOutlets', 'cableLengthNote', 'downloadXlsx', 'downloadCsv',
        'sections.protection', 'sections.cables', 'sections.elements', 'sections.boards', 'columns.article', 'columns.length', 'columns.outlets',
        'kinds.hoofdschakelaar', 'kinds.differentieel', 'kinds.differentieelautomaat', 'kinds.automatisch', 'kinds.zekering']
    for (const language of ['nl', 'fr', 'en']) {
        setLanguage(language)
        keys.forEach((key) => expect(t('materials.' + key)).not.toBe('materials.' + key))
    }
    setLanguage('nl')
})
