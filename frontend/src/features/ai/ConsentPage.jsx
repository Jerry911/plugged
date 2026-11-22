// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// /oauth/authorize: an AI assistant (Claude, ChatGPT, ...) asks to work in Plugged as the signed-in user. He sees which assistant and
// where it sends him back to, and agrees or not; the browser then goes back to the assistant with a code (or with access_denied).
// A request that is not valid (unknown assistant, an address it did not register) is shown as such: nobody is sent anywhere.
import {useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {answerConsent, fetchConsentRequest} from '../../api/aiApi.js'
import {renderInline} from '../../i18n/RichText.jsx'

/** The OAuth parameters of the address of the page. */
export const consentRequest = (search) => {
    const query = new URLSearchParams(search)
    const value = (name) => query.get(name) ?? undefined
    return {
        response_type: value('response_type'),
        client_id: value('client_id'),
        redirect_uri: value('redirect_uri'),
        state: value('state'),
        code_challenge: value('code_challenge'),
        code_challenge_method: value('code_challenge_method'),
        scope: value('scope'),
        resource: value('resource'),
    }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export default function ConsentPage({user, search = window.location.search, go = (url) => window.location.assign(url)}) {
    const {t} = useTranslation()
    const [request] = useState(() => consentRequest(search))
    const [state, setState] = useState({status: 'loading'})
    useEffect(() => {
        let live = true
        if (request.response_type !== 'code') {
            setState({status: 'invalid', error: 'response_type'})
            return
        }
        fetchConsentRequest(request.client_id, request.redirect_uri).then((result) => {
            if (!live) return
            setState(result.ok ? {status: 'ask', client: result.client, host: result.redirectHost} : {status: 'invalid', error: result.error})
        })
        return () => {
            live = false
        }
    }, [request])
    const answer = async (approve) => {
        setState((current) => ({...current, status: 'sending'}))
        const result = await answerConsent(request, approve)
        if (result.ok) go(result.redirect)
        else setState((current) => ({...current, status: 'failed', error: result.error}))
    }
    return (
        <div className="authpage ui">
            <div id="ai-consent" className="authcard">
                <h1>{t('ai.consent.title')}</h1>
                {state.status === 'loading' && <p>{t('auth.loading')}</p>}
                {state.status === 'invalid' && (
                    <p id="ai-consent-invalid" className="authmsg error">
                        {t('ai.consent.invalid')} {state.error && <small>({state.error})</small>}
                    </p>
                )}
                {['ask', 'sending', 'failed'].includes(state.status) && (
                    <>
                        <p id="ai-consent-text">{renderInline(t('ai.consent.text', {client: state.client, name: `${user.name} ${user.surname}`}))}</p>
                        <ul className="consentlist">
                            <li>{t('ai.consent.can')}</li>
                            <li>{t('ai.consent.history')}</li>
                            <li>{t('ai.consent.end')}</li>
                        </ul>
                        <p id="ai-consent-host">
                            {renderInline(t('ai.consent.host', {host: state.host}))}
                            {LOOPBACK.has(state.host) && <span className="consentwarn"> {t('ai.consent.loopback')}</span>}
                        </p>
                        {state.status === 'failed' && (
                            <p id="ai-consent-error" className="authmsg error">
                                {t('ai.consent.failed')} {state.error}
                            </p>
                        )}
                        <div className="consentbuttons">
                            <button id="ai-consent-deny" disabled={state.status === 'sending'} onClick={() => answer(false)}>
                                {t('ai.consent.deny')}
                            </button>
                            <button id="ai-consent-allow" className="accent" disabled={state.status === 'sending'} onClick={() => answer(true)}>
                                {t('ai.consent.allow')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
