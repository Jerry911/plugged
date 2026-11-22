// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account → AI-assistent: connecting the user's own AI assistant (Claude, ChatGPT, Claude Code, ...) to Plugged, so it can draw for him,
// for instance a situatieschema from the floor plan of an architect. Plugged itself has no AI: the assistant works with its own account
// and calls the MCP endpoint of Plugged (backend McpController) as this user. Here: the address to enter, the steps, the skill to
// download, the connections that exist (ended with one click) and personal keys for an assistant that is set up with a fixed key.
import {useCallback, useEffect, useState} from 'react'
import {strToU8, zipSync} from 'fflate'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {createAiKey, endAiConnection, fetchAiOverview} from '../../api/aiApi.js'
import {renderInline} from '../../i18n/RichText.jsx'
import Icon from '../../components/Icon.jsx'
import skill from './skill.md?raw'

const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {})

/** The skill for the assistant as a zip (plugged-drawings/SKILL.md), with the address of this installation in it. */
export const skillZip = (url) => zipSync({'plugged-drawings/SKILL.md': strToU8(skill.replaceAll('{{URL}}', url.replace(/\/mcp$/, '')))})

export default function AiPanel({desktop = false}) {
    const {t, locale} = useTranslation()
    const [overview, setOverview] = useState(null),
        [failed, setFailed] = useState(false),
        [keyName, setKeyName] = useState(''),
        [keyDays, setKeyDays] = useState(90),
        [newKey, setNewKey] = useState(null),
        [status, setStatus] = useState('')
    const load = useCallback(async () => {
        const result = await fetchAiOverview()
        setFailed(!result.ok)
        if (result.ok) setOverview(result)
    }, [])
    useEffect(() => {
        load()
    }, [load])
    const date = (value) => (value ? new Date(value).toLocaleDateString(locale) : '')
    const makeKey = async (event) => {
        event.preventDefault()
        const result = await createAiKey(keyName.trim(), keyDays)
        if (result.ok) {
            setNewKey(result.key)
            setKeyName('')
            load()
        } else setStatus(t('ai.keyFailed'))
    }
    const end = async (connection) => {
        if (!window.confirm(t('ai.endConfirm', {name: connection.name}))) return
        setStatus((await endAiConnection(connection.id)) ? t('ai.ended', {name: connection.name}) : t('ai.endFailed'))
        load()
    }
    const downloadSkill = () => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([skillZip(overview.url)], {type: 'application/zip'}))
        link.download = 'plugged-drawings.zip'
        link.click()
    }
    if (failed)
        return (
            <p id="ai-unavailable" className="authmsg error">
                {t('ai.unavailable')}
            </p>
        )
    if (!overview) return <p>{t('auth.loading')}</p>
    const localOnly = desktop || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(overview.url)
    return (
        <div id="ai-panel" className="accountpanel">
            <section className="accountcard">
                <h3>
                    <Icon name="star" size={18} /> {t('ai.title')}
                </h3>
                <p>{renderInline(t('ai.intro'))}</p>
                <label className="ailabel" htmlFor="ai-url">
                    {t('ai.address')}
                </label>
                <div className="aiurl">
                    <input id="ai-url" readOnly value={overview.url} onFocus={(event) => event.target.select()} />
                    <button id="ai-url-copy" onClick={() => (copy(overview.url), setStatus(t('ai.copied')))}>
                        {t('ai.copy')}
                    </button>
                </div>
                {localOnly && (
                    <p id="ai-local-only" className="authmsg error">
                        {t('ai.localOnly')}
                    </p>
                )}
                <ol className="aisteps">
                    <li>{renderInline(t('ai.steps.claude'))}</li>
                    <li>{renderInline(t('ai.steps.chatgpt'))}</li>
                    <li>
                        {renderInline(t('ai.steps.claudeCode'))}
                        <code id="ai-claude-code">claude mcp add --transport http plugged {overview.url}</code>
                    </li>
                    <li>{renderInline(t('ai.steps.use'))}</li>
                </ol>
                <p>
                    {renderInline(t('ai.skill'))}{' '}
                    <button id="ai-skill" onClick={downloadSkill}>
                        <Icon name="download" size={16} /> {t('ai.skillButton')}
                    </button>
                </p>
            </section>
            <section className="accountcard">
                <h3>
                    <Icon name="key" size={18} /> {t('ai.connections')}
                </h3>
                {overview.connections.length === 0 ? (
                    <p id="ai-none">{t('ai.none')}</p>
                ) : (
                    <ul id="ai-connections" className="ailist">
                        {overview.connections.map((connection) => (
                            <li key={connection.id} id={'ai-connection-' + connection.id}>
                                <span>
                                    <b>{connection.name}</b> <small>{t(connection.kind === 'personal' ? 'ai.kindPersonal' : 'ai.kindOauth')}</small>
                                    <br />
                                    <small>
                                        {t('ai.since', {date: date(connection.created)})}
                                        {connection.lastUsed ? ' · ' + t('ai.lastUsed', {date: date(connection.lastUsed)}) : ''}
                                        {connection.expires && connection.kind === 'personal' ? ' · ' + t('ai.expires', {date: date(connection.expires)}) : ''}
                                    </small>
                                </span>
                                <button className="danger" onClick={() => end(connection)}>
                                    {t('ai.end')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <h4>{t('ai.keyTitle')}</h4>
                <p>{t('ai.keyText')}</p>
                <form id="ai-key-form" className="aikeyform" onSubmit={makeKey}>
                    <input id="ai-key-name" placeholder={t('ai.keyName')} value={keyName} maxLength={100} onChange={(event) => setKeyName(event.target.value)} />
                    <select id="ai-key-days" value={keyDays} onChange={(event) => setKeyDays(Number(event.target.value))} aria-label={t('ai.keyValid')}>
                        {overview.keyDays.map((days) => (
                            <option key={days} value={days}>
                                {t('ai.days', {days})}
                            </option>
                        ))}
                    </select>
                    <button id="ai-key-create" className="accent" type="submit">
                        {t('ai.keyCreate')}
                    </button>
                </form>
                {newKey && (
                    <div id="ai-new-key" className="aiurl">
                        <input readOnly value={newKey} onFocus={(event) => event.target.select()} />
                        <button onClick={() => (copy(newKey), setStatus(t('ai.copied')))}>{t('ai.copy')}</button>
                        <small>{t('ai.keyOnce')}</small>
                    </div>
                )}
                <p id="ai-status" role="status" className="aistatus">
                    {status}
                </p>
            </section>
        </div>
    )
}
