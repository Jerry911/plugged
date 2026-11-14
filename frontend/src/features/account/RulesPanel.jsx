// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account → Controleregels: every user chooses for himself which rules of Controleer are checked (model/rules.js, RULE_CATALOG). A rule
// that is off is left out of the list and the ✖ ⚠ counts in all his projects. Every change is saved at once (PUT /api/account/rules).
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {RULE_CATALOG, RULE_IDS} from '../../model/rules.js'
import {saveRuleSettings} from '../../api/authApi.js'
import {toDomId} from '../../components/domId.js'
import {formatDate} from '../../model/installationDate.js'

const LEVEL_ICONS = {error: '✖', warn: '⚠', info: 'ℹ'}

/** A checkbox for a whole group: checked when all its rules are on, half when some are. */
function GroupToggle({id, on, total, label, onToggle}) {
    const ref = useRef(null)
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = on > 0 && on < total
    }, [on, total])
    return <input ref={ref} id={id} type="checkbox" checked={on === total} aria-label={label} onChange={() => onToggle(on < total)} />
}

/** `disabled` the rule ids that are off; `onChange(disabled)` with the new list (the editor uses it right away). */
export default function RulesPanel({disabled, onChange}) {
    const {t} = useTranslation()
    const [status, setStatus] = useState({kind: '', text: ''})
    const off = new Set(disabled)
    const save = async (next) => {
        const previous = disabled
        onChange(next)
        setStatus({kind: '', text: ''})
        const result = await saveRuleSettings(next)
        if (result.ok) {
            onChange(result.disabled)
            setStatus({kind: 'ok', text: t('ruleSettings.saved')})
        } else {
            onChange(previous)
            setStatus({kind: 'error', text: t('ruleSettings.saveFailed', {reason: result.error})})
        }
    }
    const setRules = (ids, on) => save(on ? disabled.filter((id) => !ids.includes(id)) : [...new Set([...disabled, ...ids])])
    const activeOff = disabled.filter((id) => RULE_IDS.includes(id)).length
    return (
        <section id="rules-panel" className="rulespanel">
            <p className="rulesintro">{t('ruleSettings.intro')}</p>
            <div className="ruleshead">
                <span id="rules-count">
                    {activeOff ? t('ruleSettings.offCount', {count: activeOff, total: RULE_IDS.length}) : t('ruleSettings.allActive', {total: RULE_IDS.length})}
                </span>
                <button id="rules-all" className="accent" disabled={!activeOff} onClick={() => save([])}>
                    {t('ruleSettings.allOn')}
                </button>
                <span id="rules-status" className={'rulesstatus ' + status.kind} role="status">
                    {status.text}
                </span>
            </div>
            <div className="rulesgroups">
                {RULE_CATALOG.map(({group, rules}) => {
                    const ids = rules.map((rule) => rule.id),
                        on = ids.filter((id) => !off.has(id)).length,
                        label = t('ruleSettings.groups.' + group)
                    return (
                        <fieldset key={group} id={'rules-group-' + group} className="rulesgroup">
                            <legend>
                                <GroupToggle id={'rules-group-toggle-' + group} on={on} total={ids.length} label={label} onToggle={(enable) => setRules(ids, enable)} />
                                <span>{label}</span>
                                <small>
                                    {on}/{ids.length}
                                </small>
                            </legend>
                            {rules.map((rule) => (
                                <label key={rule.id} className={'rulerow' + (off.has(rule.id) ? ' off' : '')}>
                                    <input id={'rules-' + toDomId(rule.id)} type="checkbox" checked={!off.has(rule.id)} onChange={(event) => setRules([rule.id], event.target.checked)} />
                                    <span className="rulename">{t('ruleSettings.rules.' + rule.id)}</span>
                                    <span className={'rulelevel level-' + rule.level} title={t('ruleSettings.levels.' + rule.level)}>
                                        {LEVEL_ICONS[rule.level]} {t('ruleSettings.levels.' + rule.level)}
                                    </span>
                                    <span className="rulearticle">
                                        {rule.article ? 'AREI ' + rule.article : t('ruleSettings.notArei')}
                                        {rule.since && (
                                            <span className="rulesince">
                                                {' · '}
                                                {t(rule.partial ? 'ruleSettings.sincePartial' : 'ruleSettings.since', {date: formatDate(rule.since)})}
                                            </span>
                                        )}
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                    )
                })}
            </div>
        </section>
    )
}
