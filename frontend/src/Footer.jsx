// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
export const FIELDS=[['titel','Titel'],['straat','Straat'],['nr','Nr'],['postcode','Postcode'],['gemeente','Gemeente'],['eigenaar','Eigenaar'],['ean','EAN-nr'],['tekenaar','Getekend door'],['datum','Datum'],['schaal','Schaal'],['rev','Revisie'],['dossier','Dossiernr'],['stelsel','Stelsel (bv. 230V TT)'],['keurder','Keuringsorganisme']]
export const FooterForm=({p,setP})=><div className="form">{FIELDS.map(([k,l])=>
 <div key={k}><label>{l}</label><input value={p.footer[k]||''} onChange={e=>setP({...p,footer:{...p.footer,[k]:e.target.value}})}/></div>)}</div>
// A4 landscape sheet 297x210mm; the footer block is fixed at the bottom (y 185-205).
export const Sheet=({p,page,total=2,name,children,svgRef,...rest})=>{const f=p.footer,c=(x,w,l,v)=><g key={l}>
 <line x1={x} y1="185" x2={x} y2="205"/><text x={x+1} y="188.5" fontSize="2.2" fill="#666">{l}</text><text x={x+1} y="195" fontSize="3.6">{v}</text></g>
 return <svg ref={svgRef} {...rest} className="sheet" viewBox="0 0 297 210">
 <rect x="5" y="5" width="287" height="200" fill="none" stroke="#000" strokeWidth=".6"/>
 {children}
 <g stroke="#000" strokeWidth=".3" fill="#000"><rect x="5" y="185" width="287" height="20" fill="#fff"/>
 {c(5,0,'Titel',f.titel)}{c(75,0,'Adres',`${f.straat||''} ${f.nr||''}, ${f.postcode||''} ${f.gemeente||''}`)}{c(150,0,'Eigenaar / EAN',`${f.eigenaar||''} ${f.ean||''}`)}
 {c(200,0,'Getekend door',f.tekenaar)}{c(235,0,'Datum / Schaal',`${f.datum||''}  ${f.schaal||''}`)}{c(268,0,'Rev',f.rev)}
 <line x1="5" y1="198" x2="292" y2="198"/><text x="6" y="203" fontSize="3" stroke="none">{name} - volgens AREI{f.stelsel?' - '+f.stelsel:''}{f.dossier?' - dossier '+f.dossier:''}{f.keurder?' - '+f.keurder:''}</text>
 <text x="286" y="203" fontSize="3" textAnchor="end" stroke="none">Blad {page}/{total}</text></g></svg>}
