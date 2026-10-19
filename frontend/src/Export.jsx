// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {jsPDF} from 'jspdf'
import {svg2pdf} from 'svg2pdf.js'
import {BoardSheet} from './Board'
import {sheetPlan} from './board'
import {SitSheet} from './Situatie'

export const AllSheets = ({p}) => (
    <div className="export">
        {sheetPlan(p).map((e) =>
            e.kind === 'een' ? (
                <BoardSheet key={e.no} p={p} pg={e.pg} b={e.b} sl={e.sl} no={e.no} total={e.total} />
            ) : (
                <SitSheet key={e.no} p={p} pg={e.pg} no={e.no} total={e.total} />
            ),
        )}
    </div>
)
export async function makePdf(p, root) {
    const els = root.querySelectorAll('svg.sheet'),
        doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
    for (let i = 0; i < els.length; i++) {
        if (i) doc.addPage()
        await svg2pdf(els[i], doc, {x: 0, y: 0, width: 297, height: 210})
    }
    doc.save((p.footer.titel || 'schema') + '.pdf')
}
