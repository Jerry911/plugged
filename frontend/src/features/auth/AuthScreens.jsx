// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The screens before the editor: the first start (create the administrator), signing in and registering.
import {useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import LanguageSelect from '../../i18n/LanguageSelect.jsx'
import {login, register, setupAdmin} from '../../api/authApi.js'

/** The top bar (name and language) and a card in the middle of the page. */
export function AuthLayout({children}) {
    return (
        <div className="authpage">
            <div className="bar ui authbar">
                <span className="authbrand">Plugged</span>
                <span style={{flex: 1}} />
                <LanguageSelect />
            </div>
            <main className="authmain">{children}</main>
        </div>
    )
}

function Field({id, label, type = 'text', value, onChange, autoComplete, readOnly, autoFocus, hint}) {
    return (
        <label className="authfield" htmlFor={id}>
            <span>{label}</span>
            <input
                id={id}
                type={type}
                value={value}
                readOnly={readOnly}
                autoFocus={autoFocus}
                autoComplete={autoComplete}
                onChange={(event) => onChange?.(event.target.value)}
            />
            {hint && <small>{hint}</small>}
        </label>
    )
}

const Message = ({id, kind, text}) =>
    text ? (
        <p id={id} className={'authmsg ' + kind} role={kind === 'error' ? 'alert' : 'status'}>
            {text}
        </p>
    ) : null

/** Submits `action()` (which answers {ok, error}) once at a time and shows its error. */
const useSubmit = () => {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('')
    const submit = async (event, action) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
            const result = await action()
            if (result && !result.ok) setError(result.error)
        } finally {
            setBusy(false)
        }
    }
    return {busy, error, setError, submit}
}

/** The password twice: the two must be the same. */
function PasswordFields({password, setPassword, repeat, setRepeat}) {
    const {t} = useTranslation()
    return (
        <>
            <Field id="auth-password" type="password" label={t('auth.password')} value={password} onChange={setPassword} autoComplete="new-password" hint={t('auth.passwordHint')} />
            <Field id="auth-password2" type="password" label={t('auth.passwordRepeat')} value={repeat} onChange={setRepeat} autoComplete="new-password" />
        </>
    )
}

/** First start: the details of the administrator. The email address is the one of PLUGGED_ADMIN_EMAIL and cannot be changed. */
export function SetupScreen({adminEmail, onDone}) {
    const {t} = useTranslation()
    const [name, setName] = useState(''),
        [surname, setSurname] = useState(''),
        [password, setPassword] = useState(''),
        [repeat, setRepeat] = useState(''),
        [setupKey, setSetupKey] = useState('')
    const {busy, error, setError, submit} = useSubmit()
    const onSubmit = (event) =>
        submit(event, async () => {
            if (password !== repeat) return setError(t('auth.passwordMismatch'))
            const result = await setupAdmin({name, surname, password, setupKey})
            if (result.ok) onDone(result.user)
            return result
        })
    return (
        <AuthLayout>
            <form id="setup-form" className="authcard" onSubmit={onSubmit} noValidate>
                <h1>{t('auth.setup.title')}</h1>
                <p className="authintro">{t('auth.setup.intro')}</p>
                {adminEmail ? (
                    <>
                        <Field id="auth-setup-key" label={t('auth.setup.key')} value={setupKey} onChange={setSetupKey} autoComplete="off" hint={t('auth.setup.keyHint')} autoFocus />
                        <Field id="auth-email" type="email" label={t('auth.email')} value={adminEmail} readOnly hint={t('auth.setup.emailFixed')} />
                        <Field id="auth-name" label={t('auth.name')} value={name} onChange={setName} autoComplete="given-name" />
                        <Field id="auth-surname" label={t('auth.surname')} value={surname} onChange={setSurname} autoComplete="family-name" />
                        <PasswordFields password={password} setPassword={setPassword} repeat={repeat} setRepeat={setRepeat} />
                        <Message id="auth-error" kind="error" text={error} />
                        <button id="auth-submit" className="authsubmit" type="submit" disabled={busy}>
                            {t('auth.setup.submit')}
                        </button>
                    </>
                ) : (
                    <Message id="auth-error" kind="error" text={t('auth.setup.noAdminEmail')} />
                )}
            </form>
        </AuthLayout>
    )
}

/**
 * Signing in. `email` fills in the address (after a registration, or when the session ended); `notice` is a message above the form;
 * `onRegister` opens the registration (absent: no link, e.g. when the session ended in the middle of the work).
 */
export function LoginForm({email: initialEmail = '', notice, onLogin, onRegister, title}) {
    const {t} = useTranslation()
    const [email, setEmail] = useState(initialEmail),
        [password, setPassword] = useState('')
    const {busy, error, submit} = useSubmit()
    const onSubmit = (event) =>
        submit(event, async () => {
            const result = await login({email, password})
            if (result.ok) onLogin(result.user)
            return result
        })
    return (
        <form id="login-form" className="authcard" onSubmit={onSubmit} noValidate>
            <h1>{title || t('auth.login.title')}</h1>
            <Message id="auth-notice" kind="info" text={notice} />
            <Field id="auth-email" type="email" label={t('auth.email')} value={email} onChange={setEmail} autoComplete="username" autoFocus={!initialEmail} />
            <Field id="auth-password" type="password" label={t('auth.password')} value={password} onChange={setPassword} autoComplete="current-password" autoFocus={!!initialEmail} />
            <Message id="auth-error" kind="error" text={error} />
            <button id="auth-submit" className="authsubmit" type="submit" disabled={busy}>
                {t('auth.login.submit')}
            </button>
            {onRegister && (
                <p className="authswitch">
                    {t('auth.login.noAccount')}{' '}
                    <a id="link-register" href="#register" onClick={onRegister}>
                        {t('auth.login.registerLink')}
                    </a>
                </p>
            )}
        </form>
    )
}

export function LoginScreen(props) {
    return (
        <AuthLayout>
            <LoginForm {...props} />
        </AuthLayout>
    )
}

/** A new account. It can sign in once the administrator has approved it: `onRegistered(email)` goes back to signing in. */
export function RegisterScreen({onRegistered, onLogin}) {
    const {t} = useTranslation()
    const [name, setName] = useState(''),
        [surname, setSurname] = useState(''),
        [email, setEmail] = useState(''),
        [password, setPassword] = useState(''),
        [repeat, setRepeat] = useState('')
    const {busy, error, setError, submit} = useSubmit()
    const onSubmit = (event) =>
        submit(event, async () => {
            if (password !== repeat) return setError(t('auth.passwordMismatch'))
            const result = await register({name, surname, email, password})
            if (result.ok) onRegistered(result.user.email)
            return result
        })
    return (
        <AuthLayout>
            <form id="register-form" className="authcard" onSubmit={onSubmit} noValidate>
                <h1>{t('auth.register.title')}</h1>
                <p className="authintro">{t('auth.register.intro')}</p>
                <Field id="auth-name" label={t('auth.name')} value={name} onChange={setName} autoComplete="given-name" autoFocus />
                <Field id="auth-surname" label={t('auth.surname')} value={surname} onChange={setSurname} autoComplete="family-name" />
                <Field id="auth-email" type="email" label={t('auth.email')} value={email} onChange={setEmail} autoComplete="email" />
                <PasswordFields password={password} setPassword={setPassword} repeat={repeat} setRepeat={setRepeat} />
                <Message id="auth-error" kind="error" text={error} />
                <button id="auth-submit" className="authsubmit" type="submit" disabled={busy}>
                    {t('auth.register.submit')}
                </button>
                <p className="authswitch">
                    {t('auth.register.haveAccount')}{' '}
                    <a id="link-login" href="#login" onClick={onLogin}>
                        {t('auth.register.loginLink')}
                    </a>
                </p>
            </form>
        </AuthLayout>
    )
}
