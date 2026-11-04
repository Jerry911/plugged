// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Who is using the application. Before the editor: the first start (no administrator yet), else signing in or registering (#register).
// The editor gets the signed-in user and a way to sign out. When the session ends during the work (a 401 of the API), the sign-in form
// opens on top of the editor, so nothing that was not saved yet is lost.
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {fetchAuthStatus, logout} from '../../api/authApi.js'
import {onUnauthorized} from '../../api/http.js'
import {LoginForm, LoginScreen, RegisterScreen, SetupScreen} from './AuthScreens.jsx'

const REGISTER_HASH = '#register'
export const STATUS_REFRESH_MS = 60_000
const screenOfHash = () => (window.location.hash === REGISTER_HASH ? 'register' : 'login')

/** `children({user, onLogout})` renders the application for the signed-in user. */
export default function AuthGate({children}) {
    const {t} = useTranslation()
    const [state, setState] = useState({status: 'loading'}),
        [screen, setScreen] = useState(screenOfHash),
        [notice, setNotice] = useState(null), // {text, email} above the sign-in form
        [sessionLost, setSessionLost] = useState(false)
    const load = useCallback(async () => {
        setState({status: 'loading'})
        try {
            setState({status: 'ready', ...(await fetchAuthStatus())})
        } catch {
            setState({status: 'error'})
        }
    }, [])
    useEffect(() => {
        load()
    }, [load])
    useEffect(() => {
        const onHashChange = () => setScreen(screenOfHash())
        addEventListener('hashchange', onHashChange)
        return () => removeEventListener('hashchange', onHashChange)
    }, [])
    useEffect(() => onUnauthorized(() => setSessionLost(true)), [])
    // what the user may do can change while he works (a teacher switches the educational mode, an administrator changes his role): the
    // status is fetched again when the window gets the focus and every minute
    const signedInId = state.user?.id
    useEffect(() => {
        if (signedInId == null) return
        const refresh = async () => {
            try {
                const status = await fetchAuthStatus()
                if (status.user?.id === signedInId) setState((current) => (current.user ? {...current, user: status.user} : current))
            } catch {
                // offline for a moment: the next refresh tries again
            }
        }
        const timer = setInterval(refresh, STATUS_REFRESH_MS)
        addEventListener('focus', refresh)
        return () => {
            clearInterval(timer)
            removeEventListener('focus', refresh)
        }
    }, [signedInId])
    const go = (target) => (event) => {
        event?.preventDefault()
        history.replaceState(null, '', target === 'register' ? REGISTER_HASH : window.location.pathname + window.location.search)
        setScreen(target)
    }
    const signedIn = (user) => {
        setNotice(null)
        setSessionLost(false)
        setState((current) => ({...current, setupRequired: false, user}))
    }
    const onLogout = async () => {
        await logout()
        setNotice({text: t('auth.signedOut')})
        setState((current) => ({...current, user: null}))
    }
    if (state.status === 'loading')
        return (
            <p id="auth-loading" className="ui" style={{padding: 16}}>
                {t('auth.loading')}
            </p>
        )
    if (state.status === 'error')
        return (
            <div id="auth-unavailable" className="ui" style={{padding: 16}}>
                <p>{t('auth.unavailable')}</p>
                <button id="auth-retry" onClick={load}>
                    {t('app.retry')}
                </button>
            </div>
        )
    if (state.setupRequired) return <SetupScreen adminEmail={state.adminEmail} onDone={signedIn} />
    if (!state.user) {
        if (screen === 'register')
            return (
                <RegisterScreen
                    onLogin={go('login')}
                    onRegistered={(email) => {
                        setNotice({text: t('auth.register.done'), email})
                        go('login')()
                    }}
                />
            )
        return <LoginScreen key={notice?.email} email={notice?.email} notice={notice?.text} onLogin={signedIn} onRegister={go('register')} />
    }
    return (
        <>
            {children({user: state.user, onLogout})}
            {sessionLost && (
                <div id="session-lost" className="authoverlay ui" role="dialog" aria-modal="true">
                    <LoginForm email={state.user.email} title={t('auth.sessionLost.title')} notice={t('auth.sessionLost.text')} onLogin={signedIn} />
                </div>
            )}
        </>
    )
}
