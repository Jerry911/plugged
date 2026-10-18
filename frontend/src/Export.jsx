// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {jsPDF} from 'jspdf'
import {svg2pdf} from 'svg2pdf.js'
import {EenSheet} from './Eendraad'
import {SitSheet} from './Situatie'

export const AllSheets = ({p}) => {
    const n = p.een.length + p.sit.length
    return <div className="export">{p.een.map((g, i) => <EenSheet key={g.id} p={p} pg={g} no={i + 1}
                                                                  total={n}/>)}{p.sit.map((g, i) => <SitSheet key={g.id}
                                                                                                              p={p}
                                                                                                              pg={g}
                                                                                                              no={p.een.length + i + 1}
                                                                                                              total={n}/>)}</div>
}

export async function makePdf(p, root) {
    const els = root.querySelectorAll('svg.sheet'),
        doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
    for (let i = 0; i < els.length; i++) {
        if (i) doc.addPage();
        await svg2pdf(els[i], doc, {x: 0, y: 0, width: 297, height: 210})
    }
    doc.save((p.footer.titel || 'schema') + '.pdf')
}
