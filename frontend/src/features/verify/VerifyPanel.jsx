// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Controle panel: the issues of model/rules.js grouped as on the Controleregels page, the most serious group first, each with how many
// of its checks are in order; above them what still has to be filled in before the inspection (Kaderinfo and the measurements). Clicking an
// issue jumps to the element it is about, clicking a missing field opens Kaderinfo on it.
import {REQUIRED_FOOTER_FIELDS, RULE_CATALOG, rulesNotApplicable, summarize} from '../../model/rules.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import Icon from '../../components/Icon.jsx'

const LEVEL_ICONS = {error: 'error', warn: 'warning', info: 'info'}
const LEVEL_RANK = {error: 0, warn: 1, info: 2}
export const MEASUREMENT_FIELDS = ['aardingsweerstand', 'isolatieweerstand', 'meetdatum']
// a click that ends a text selection (dragging over a message to copy it) must not jump to the element
const isSelectingText = () => !!window.getSelection?.()?.toString()

/**
 * The issues per group of RULE_CATALOG: [{group, issues, worst, checks, ok}]: `checks` the rules of the group that apply (not switched off,
 * not left out for an older installation), `ok` how many of them found nothing. Issues of a rule outside the catalog form the group 'other'.
 * Sorted: the group with the most serious issue first, the groups without issues last, otherwise in the order of the catalog.
 */
export const issueGroups = (issues, project, disabled = []) => {
    const off = new Set(disabled),
        leftOut = new Set(rulesNotApplicable(project).filter((rule) => !rule.partial).map((rule) => rule.id)),
        groupOf = new Map(RULE_CATALOG.flatMap((group) => group.rules.map((rule) => [rule.id, group.group])))
    const groups = [...RULE_CATALOG.map((group) => group.group), 'other'].map((name, order) => {
        const rules = (RULE_CATALOG.find((group) => group.group === name)?.rules || []).filter((rule) => !off.has(rule.id) && !leftOut.has(rule.id))
        const inGroup = issues.filter((issue) => (groupOf.get(issue.rule) || 'other') === name)
        const failing = new Set(inGroup.map((issue) => issue.rule))
        return {
            group: name,
            order,
            issues: [...inGroup].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]),
            worst: inGroup.reduce((worst, issue) => Math.min(worst, LEVEL_RANK[issue.level]), 3),
            checks: rules.length,
            ok: rules.filter((rule) => !failing.has(rule.id)).length,
        }
    })
    return groups.filter((group) => group.checks || group.issues.length).sort((a, b) => a.worst - b.worst || a.order - b.order)
}

/** What has to be filled in before the inspection: [{key, fields, missing}] for Kaderinfo and for the measurements. */
export const inspectionChecklist = (project) => {
    const footer = project?.footer || {},
        missing = (fields) => fields.filter((field) => !String(footer[field] ?? '').trim())
    return [
        {key: 'footer', fields: REQUIRED_FOOTER_FIELDS, missing: missing(REQUIRED_FOOTER_FIELDS)},
        {key: 'measurements', fields: MEASUREMENT_FIELDS, missing: missing(MEASUREMENT_FIELDS)},
    ]
}

/**
 * `disabled` the rule ids the user switched off, `onRules()` opens Account → Controleregels. `notApplicable` how many rules do not apply to
 * this installation because it started before their date (`installationDate` as typed in Kaderinfo); `onInstallation()` opens it.
 * `onFooter(field)` opens Kaderinfo on a field.
 */
export default function VerifyPanel({
    issues,
    project,
    onGoTo,
    onClose,
    disabled = [],
    onRules,
    notApplicable = 0,
    installationDate = '',
    onInstallation,
    onFooter,
}) {
    const {t} = useTranslation()
    const counts = summarize(issues)
    const groups = issueGroups(issues, project, disabled),
        checks = groups.reduce((sum, group) => sum + group.checks, 0),
        ok = groups.reduce((sum, group) => sum + group.ok, 0)
    let index = 0
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
                    <Icon name="check" /> {t('verify.noProblems')}
                </div>
            )}
            <p id="verify-summary">
                {t('verify.summary', {errors: counts.error, warnings: counts.warn, notes: counts.info})}
                {checks > 0 && <span id="verify-checks"> · {t('verify.checksOk', {ok, count: checks})}</span>}
            </p>
            <div id="verify-checklist" className="verifylist">
                <b>{t('verify.beforeInspection')}</b>
                {inspectionChecklist(project).map((part) => (
                    <div key={part.key} id={'verify-todo-' + part.key} className={'verifytodo' + (part.missing.length ? '' : ' done')}>
                        <Icon name={part.missing.length ? 'edit' : 'check'} /> {t('verify.todo.' + part.key)}{' '}
                        <span className="count">
                            {part.fields.length - part.missing.length}/{part.fields.length}
                        </span>
                        {part.missing.length > 0 && (
                            <span className="verifymissing">
                                {' '}
                                {t('verify.missing')}{' '}
                                {part.missing.map((field, position) => (
                                    <span key={field}>
                                        {position > 0 && ', '}
                                        <button id={'verify-fill-' + field} className="linkbtn" onClick={() => onFooter?.(field)}>
                                            {t('footer.fields.' + field)}
                                        </button>
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                ))}
            </div>
            <div id="verify-issues">
                {groups.map((group) => (
                    <details key={group.group} id={'verify-group-' + group.group} className={'verifygroup' + (group.issues.length ? '' : ' clean')} open={group.worst < 2}>
                        <summary>
                            <Icon name={group.issues.length ? LEVEL_ICONS[['error', 'warn', 'info'][group.worst]] : 'check'} />{' '}
                            <b>{t('ruleSettings.groups.' + group.group)}</b>{' '}
                            {group.checks > 0 && (
                                <span className="count">
                                    {group.ok}/{group.checks}
                                </span>
                            )}
                        </summary>
                        <ul style={{padding: 0}}>
                            {group.issues.map((issue) => {
                                const position = index++
                                return (
                                    <li
                                        key={issue.id}
                                        id={'verify-issue-' + position}
                                        data-rule={issue.rule}
                                        data-node={issue.nodeId}
                                        className={'iss ' + issue.level}
                                        onClick={() => isSelectingText() || onGoTo(issue)}
                                    >
                                        <Icon name={LEVEL_ICONS[issue.level]} /> {issue.mark && <b>{issue.mark} </b>}
                                        {issue.msg}
                                        {issue.pageName && <small> — {issue.pageName}</small>}
                                    </li>
                                )
                            })}
                        </ul>
                    </details>
                ))}
            </div>
            {notApplicable > 0 && (
                <p>
                    <button id="verify-not-applicable" className="linkbtn" onClick={onInstallation}>
                        {t('verify.notApplicable', {count: notApplicable, date: installationDate})}
                    </button>
                </p>
            )}
            {disabled.length > 0 && (
                <p>
                    <button id="verify-disabled" className="linkbtn" onClick={onRules}>
                        {t('verify.disabledNote', {count: disabled.length})}
                    </button>
                </p>
            )}
            <small>{t('verify.disclaimer')}</small>
        </div>
    )
}
