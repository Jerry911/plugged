// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Controle panel: the issues of model/rules.js; clicking one jumps to the element it is about.
import {summarize} from '../../model/rules.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

const LEVEL_ICONS = {error: '✖', warn: '⚠', info: 'ℹ'}
// a click that ends a text selection (dragging over a message to copy it) must not jump to the element
const isSelectingText = () => !!window.getSelection?.()?.toString()

export default function VerifyPanel({issues, onGoTo, onClose}) {
    const {t} = useTranslation()
    const counts = summarize(issues)
    return (
        <div id="verify-panel" className="ui verify" role="region" aria-label={t('verify.title')}>
            <div className="tb">
                <b>{t('verify.heading')}</b>
                <button id="verify-close" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
            {!counts.error && !counts.warn && (
                <div id="verify-ok" className="ok">
                    ✓ {t('verify.noProblems')}
                </div>
            )}
            <p id="verify-summary">{t('verify.summary', {errors: counts.error, warnings: counts.warn, notes: counts.info})}</p>
            <ul id="verify-issues" style={{padding: 0}}>
                {issues.map((issue, index) => (
                    <li
                        key={issue.id}
                        id={'verify-issue-' + index}
                        data-rule={issue.rule}
                        data-node={issue.nodeId}
                        className={'iss ' + issue.level} onClick={() => isSelectingText() || onGoTo(issue)}>
                        <span>{LEVEL_ICONS[issue.level]}</span> {issue.mark && <b>{issue.mark} </b>}
                        {issue.msg}
                        {issue.pageName && <small> — {issue.pageName}</small>}
                    </li>
                ))}
            </ul>
            <small>{t('verify.disclaimer')}</small>
        </div>
    )
}
