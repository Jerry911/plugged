// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
export const FIELDS = [
    ['titel', 'Titel'],
    ['straat', 'Straat'],
    ['nr', 'Nr'],
    ['postcode', 'Postcode'],
    ['gemeente', 'Gemeente'],
    ['eigenaar', 'Eigenaar'],
    ['ean', 'EAN-nr'],
    ['tekenaar', 'Getekend door'],
    ['datum', 'Datum'],
    ['schaal', 'Schaal'],
    ['rev', 'Revisie'],
    ['dossier', 'Dossiernr'],
    ['stelsel', 'Stelsel (bv. 230V TT)'],
    ['keurder', 'Keuringsorganisme'],
]
export const FooterForm = ({p, setP, focus}) => (
    <div className="form">
        {FIELDS.map(([k, l]) => (
            <div key={k}>
                <label>{l}</label>
                <input
                    autoFocus={focus === k}
                data-tour={'footer-' + k}
                    value={p.footer[k] || ''}
                    onChange={(e) => setP({...p, footer: {...p.footer, [k]: e.target.value}})}
                />
            </div>
        ))}
    </div>
)
export const FooterDialog = ({p, setP, focus, onClose}) => (
    <div className="dlg ui" role="dialog" aria-label="Kaderinfo" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="tb">
            <b>Kaderinfo (onderaan elk blad)</b> <button className="sheetInfoBtn" onClick={onClose}>✕</button>
        </div>
        <FooterForm p={p} setP={setP} focus={focus} />
    </div>
)
const join = (a, s = ' ') => a.filter((x) => x && String(x).trim()).join(s)
// A4 landscape sheet 297x210mm; the footer block is fixed at the bottom (y 185-205). With onFooter, footer cells are clickable to edit.
export const Sheet = ({p, page, total = 2, name, children, svgRef, onFooter, ...rest}) => {
    const f = p.footer || {}
    const cells = [
        [5, 70, 'titel', 'Titel', f.titel],
        [75, 75, 'straat', 'Adres', join([join([f.straat, f.nr]), join([f.postcode, f.gemeente])], ', ')],
        [150, 50, 'eigenaar', 'Eigenaar / EAN', join([f.eigenaar, f.ean])],
        [200, 35, 'tekenaar', 'Getekend door', f.tekenaar],
        [235, 33, 'datum', 'Datum / Schaal', join([f.datum, f.schaal], '  ')],
        [268, 24, 'rev', 'Rev', f.rev],
    ]
    return (
        <svg ref={svgRef} {...rest} className="sheet" viewBox="0 0 297 210">
            <rect x="5" y="5" width="287" height="200" fill="none" stroke="#000" strokeWidth=".6" />
            {children}
            <g stroke="#000" strokeWidth=".3" fill="#000">
                <rect x="5" y="185" width="287" height="20" fill="#fff" />
                {cells.map(([x, w, k, l, v]) => (
                    <g key={k}>
                        <line x1={x} y1="185" x2={x} y2="205" />
                        <text x={x + 1} y="188.5" fontSize="2.2" fill="#666" stroke="none">
                            {l}
                        </text>
                        {v ? (
                            <text x={x + 1} y="195" fontSize="3.6" fill="#000" stroke="none">
                                {v}
                            </text>
                        ) : (
                            onFooter && (
                                <text x={x + 1} y="195" fontSize="2.8" fontStyle="italic" fill="#aaa" stroke="none">
                                    klik om in te vullen
                                </text>
                            )
                        )}
                        {onFooter && (
                            <rect className="fcell" x={x} y="185" width={w} height="13" stroke="none" onClick={() => onFooter(k)} />
                        )}
                    </g>
                ))}
                <line x1="5" y1="198" x2="292" y2="198" />
                <text x="6" y="203" fontSize="3" stroke="none">
                    {f.stelsel ? ' - ' + f.stelsel : ''}
                    {f.dossier ? ' - dossier ' + f.dossier : ''}
                    {f.keurder ? ' - ' + f.keurder : ''}
                </text>
                {onFooter && (
                    <rect className="fcell" x="5" y="198" width="225" height="7" stroke="none" onClick={() => onFooter('dossier')} />
                )}
                <text x="286" y="203" fontSize="3" textAnchor="end" stroke="none">
                    Blad {page}/{total}
                </text>
            </g>
        </svg>
    )
}
