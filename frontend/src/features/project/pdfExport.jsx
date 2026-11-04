// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// PDF export and printing: every sheet of the project (eendraadschema and situatieschema), numbered continuously.
import {jsPDF} from 'jspdf'
import {svg2pdf} from 'svg2pdf.js'
import {BoardSheet} from '../oneWire/BoardSheet.jsx'
import {SituationSheet} from '../situation/SituationSheet.jsx'
import {sheetPlan} from '../../model/boardLayout.js'

/** All sheets of the project, rendered for the PDF and for printing (see styles/print.css). */
export const AllSheets = ({project}) => (
    <div className="export">
        {sheetPlan(project).map((sheet) =>
            sheet.kind === 'een' ? (
                <BoardSheet key={sheet.number} project={project} board={sheet.board} slice={sheet.slice} number={sheet.number} total={sheet.total} />
            ) : (
                <SituationSheet key={sheet.number} project={project} page={sheet.page} number={sheet.number} total={sheet.total} />
            ),
        )}
    </div>
)

// an A4 landscape page in mm
const PAGE_WIDTH = 297,
    PAGE_HEIGHT = 210

/** Turns the rendered sheets under `container` into a vector PDF (one A4 landscape page per sheet) and downloads it. */
export async function makePdf(project, container) {
    const sheets = container.querySelectorAll('svg.sheet'),
        pdf = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
    for (let index = 0; index < sheets.length; index++) {
        if (index) pdf.addPage()
        await svg2pdf(sheets[index], pdf, {x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT})
    }
    pdf.save((project.footer.titel || 'schema') + '.pdf')
}
