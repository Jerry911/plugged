// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// "Mijn groepen", for the owners of a group (teachers) who are no administrator: the groups they own, their members, and the switch of the
// educational mode. In educational mode the members who are no owner (students) cannot validate a schema, nor import or export one.
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {fetchOwnedGroups, setGroupEducational} from '../../api/authApi.js'
import {fullName} from './names.js'

/**
 * The switch of the educational mode of one group, with what it means. It shows the new state at once while `onChange` (a promise) saves
 * it; afterwards the group as the server has it decides again (a refusal puts the switch back).
 */
export function EducationalSwitch({group, disabled, onChange}) {
    const {t} = useTranslation()
    const [pending, setPending] = useState(null)
    const on = pending ?? !!group.educational
    const change = async (value) => {
        setPending(value)
        try {
            await onChange(value)
        } finally {
            setPending(null)
        }
    }
    return (
        <label className="eduswitch" title={t('educational.switchTitle')}>
            <input type="checkbox" id={'group-' + group.id + '-educational'} checked={on} disabled={disabled || pending !== null} onChange={(event) => change(event.target.checked)} />
            🎓 {t('educational.switch')}
            <small>{on ? t('educational.on') : t('educational.off')}</small>
        </label>
    )
}

export default function TeacherPage() {
    const {t} = useTranslation()
    const [groups, setGroups] = useState(null),
        [failed, setFailed] = useState(false),
        [busy, setBusy] = useState(false),
        [message, setMessage] = useState({kind: '', text: ''})
    const load = useCallback(async () => {
        try {
            setGroups(await fetchOwnedGroups())
            setFailed(false)
        } catch {
            setFailed(true)
        }
    }, [])
    useEffect(() => {
        load()
    }, [load])
    const switchMode = async (group, educational) => {
        setBusy(true)
        const result = await setGroupEducational(group.id, educational)
        setBusy(false)
        setMessage(result.ok ? {kind: 'ok', text: t(educational ? 'educational.switchedOn' : 'educational.switchedOff', {group: group.name})} : {kind: 'error', text: result.error})
        await load()
    }
    return (
        <div id="teacher-page" className="adminpage">
            <div className="adminhead">
                <h1>{t('teacher.title')}</h1>
            </div>
            <p>{t('teacher.intro')}</p>
            {message.text && (
                <p id="teacher-message" className={'authmsg ' + (message.kind === 'ok' ? 'info' : 'error')} role="status">
                    {message.text}
                </p>
            )}
            {failed && (
                <p id="teacher-failed" className="authmsg error">
                    {t('teacher.loadFailed')}
                </p>
            )}
            {groups && (
                <ul className="grouplist">
                    {groups.map((group) => (
                        <li key={group.id} id={'group-' + group.id} className={'groupcard' + (group.educational ? ' edu' : '')}>
                            <div className="grouphead">
                                <h3>{group.name}</h3>
                                <span style={{flex: 1}} />
                                <EducationalSwitch group={group} disabled={busy} onChange={(on) => switchMode(group, on)} />
                            </div>
                            <ul className="groupmembers" aria-label={t('groups.members')}>
                                {group.members.map((member) => (
                                    <li key={member.id} className={'memberchip' + (member.owner ? ' owner' : '')} title={member.email}>
                                        {member.owner && '★ '}
                                        {fullName(member)}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
