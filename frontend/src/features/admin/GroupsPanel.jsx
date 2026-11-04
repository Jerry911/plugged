// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The groups on the Beheer page: a new group, and per group its members (add one of the approved accounts, remove one), rename, remove.
import {useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {fullName} from './names.js'
import {EducationalSwitch} from './TeacherPage.jsx'

function GroupCard({group, users, busy, actions}) {
    const {t} = useTranslation()
    const [candidate, setCandidate] = useState('')
    const memberIds = new Set(group.members.map((member) => member.id))
    const candidates = users.filter((user) => user.approved && !memberIds.has(user.id))
    const add = async () => {
        const user = users.find((account) => String(account.id) === candidate)
        if (!user) return
        await actions.addMember(group, user)
        setCandidate('')
    }
    return (
        <li id={'group-' + group.id} className="groupcard">
            <div className="grouphead">
                <h3>{group.name}</h3>
                <span className="admincount" title={t('groups.memberCount', {count: group.members.length})}>
                    {group.members.length}
                </span>
                <span style={{flex: 1}} />
                <EducationalSwitch group={group} disabled={busy} onChange={(on) => actions.setEducational(group, on)} />
                <button id={'group-rename-' + group.id} disabled={busy} onClick={() => actions.renameGroup(group)}>
                    ✎ {t('groups.rename')}
                </button>
                <button id={'group-delete-' + group.id} className="danger" disabled={busy} onClick={() => actions.deleteGroup(group)}>
                    {t('groups.delete')}
                </button>
            </div>
            {group.members.length ? (
                <ul className="groupmembers" aria-label={t('groups.members')}>
                    {group.members.map((member) => (
                        <li key={member.id} className={'memberchip' + (member.owner ? ' owner' : '')} title={member.email}>
                            <button
                                id={'group-' + group.id + '-owner-' + member.id}
                                className="ownertoggle"
                                aria-pressed={!!member.owner}
                                aria-label={t(member.owner ? 'groups.removeOwner' : 'groups.makeOwner', {name: fullName(member)})}
                                title={t(member.owner ? 'groups.removeOwner' : 'groups.makeOwner', {name: fullName(member)})}
                                disabled={busy}
                                onClick={() => actions.setOwner(group, member, !member.owner)}
                            >
                                {member.owner ? '★' : '☆'}
                            </button>
                            {fullName(member)}
                            <button
                                id={'group-' + group.id + '-remove-' + member.id}
                                aria-label={t('groups.removeMember', {name: fullName(member)})}
                                title={t('groups.removeMember', {name: fullName(member)})}
                                disabled={busy}
                                onClick={() => actions.removeMember(group, member)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="groupempty">{t('groups.noMembers')}</p>
            )}
            {candidates.length > 0 && (
                <div className="groupadd">
                    <select id={'group-' + group.id + '-candidate'} aria-label={t('groups.addMember')} value={candidate} onChange={(event) => setCandidate(event.target.value)}>
                        <option value="">{t('groups.choose')}</option>
                        {candidates.map((user) => (
                            <option key={user.id} value={user.id}>
                                {fullName(user)} ({user.email})
                            </option>
                        ))}
                    </select>
                    <button id={'group-' + group.id + '-add'} disabled={busy || !candidate} onClick={add}>
                        + {t('groups.addMember')}
                    </button>
                </div>
            )}
        </li>
    )
}

export default function GroupsPanel({users, groups, busy, actions}) {
    const {t} = useTranslation()
    const [name, setName] = useState('')
    const create = async (event) => {
        event.preventDefault()
        if (!name.trim()) return
        if (await actions.createGroup(name)) setName('')
    }
    return (
        <section id="admin-groups" className="adminsection">
            <p>{t('groups.intro')}</p>
            <form id="groups-create-form" className="groupcreate" onSubmit={create}>
                <input id="groups-new-name" value={name} maxLength={100} placeholder={t('groups.newName')} aria-label={t('groups.newName')} onChange={(event) => setName(event.target.value)} />
                <button id="groups-create" type="submit" className="accent" disabled={busy || !name.trim()}>
                    + {t('groups.create')}
                </button>
            </form>
            {groups.length ? (
                <ul className="grouplist">
                    {groups.map((group) => (
                        <GroupCard key={group.id} group={group} users={users} busy={busy} actions={actions} />
                    ))}
                </ul>
            ) : (
                <p id="groups-empty" className="groupempty">
                    {t('groups.empty')}
                </p>
            )}
        </section>
    )
}
