// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {summarize} from './rules'

const ICON = {error: '✖', warn: '⚠', info: 'ℹ'}
export default function Verify({issues, onGo, onClose}) {
    const c = summarize(issues)
    return <div className="ui verify" role="region" aria-label="Controle">
        <div className="tb"><b>Controle volgens AREI (vereenvoudigd)</b>
            <button onClick={onClose}>Sluiten</button>
        </div>
        {!c.error && !c.warn && <div className="ok">✓ Geen fouten of waarschuwingen gevonden</div>}
        <p>{c.error} fouten · {c.warn} waarschuwingen · {c.info} opmerkingen</p>
        <ul style={{padding: 0}}>{issues.map(i => <li key={i.id} className={'iss ' + i.level} onClick={() => onGo(i)}>
            <span>{ICON[i.level]}</span> {i.msg}{i.pageName && <small> — {i.pageName}</small>}</li>)}</ul>
        <small>Hulpmiddel op basis van richtwaarden; vervangt de keuring door een erkend organisme niet.</small></div>
}
