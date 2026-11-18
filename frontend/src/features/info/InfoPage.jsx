// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Info tab: what Plugged is and does (with screenshots), accounts, groups and roles, the educational mode, shortcuts, FAQ, contact
// form (opens the visitor's own mail program), the source code and the donate button (at the top and at the bottom).
import {useEffect, useState} from 'react'
import {fetchInfo} from '../../api/projectApi.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import RichText, {renderInline} from '../../i18n/RichText.jsx'
import {translation} from '../../i18n/translate.js'
import SCREENSHOT_SIZES from './screenshotSizes.json'

/** Where the source code is (AGPL: whoever uses Plugged can get it). */
export const SOURCE_URL = 'https://github.com/Jerry911/plugged'

export const SECTIONS = ['info-over', 'info-functies', 'info-rollen', 'info-educatief', 'info-sneltoetsen', 'info-faq', 'info-contact', 'info-steun']
const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView?.({behavior: 'smooth', block: 'start'})

// The screenshots of every feature (in public/info/<language>/<name>.webp, made by e2e/info-screenshots.spec.js)
export const FEATURE_IMAGES = {
    eendraadschema: ['eendraadschema'],
    situatieschema: ['situatieschema', 'sjablonen'],
    bedradingsschema: ['bedradingsschema'],
    controleren: ['controleren', 'controleregels'],
    projecten: ['projecten'],
    samenwerken: [],
    componenten: ['componenten'],
    qr: ['qr'],
    export: ['materiaallijst', 'exporteren'],
    talen: [],
}
export const ROLE_IMAGE = 'groepen'

// The icons of the features and roles: simple line drawings in the colour of the text (yellow on the dark blue circle), not emoji, which
// every system draws in its own colours (dark ones on Windows, hardly visible on the circle)
const ICON_PATHS = {
    eendraadschema: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    situatieschema: (
        <>
            <path d="M3 11 12 3l9 8" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M10 20v-6h4v6" />
        </>
    ),
    bedradingsschema: (
        <>
            <path d="M6 3v6h12v12" />
            <path d="M6 13v8" />
            <circle cx="6" cy="11" r="2" />
            <circle cx="18" cy="9" r="1.2" />
        </>
    ),
    controleren: <path d="m4 12.5 5 5L20 6.5" />,
    projecten: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    samenwerken: (
        <>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
            <circle cx="17.5" cy="9" r="2.5" />
            <path d="M17.5 14c2.4 0 4 1.9 4 4.5" />
        </>
    ),
    componenten: (
        <>
            <path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z" />
            <path d="m14 7 3.5 3.5" />
        </>
    ),
    qr: (
        <>
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
            <path d="M14 14h3v3h-3zM18 18h3v3h-3zM20 14h1M14 20v1" />
        </>
    ),
    export: (
        <>
            <path d="M12 3v12" />
            <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
            <path d="M4 20h16" />
        </>
    ),
    talen: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c3 3.2 3 14.8 0 18-3-3.2-3-14.8 0-18z" />
        </>
    ),
    user: (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" />
        </>
    ),
    owner: (
        <>
            <path d="M2 9.5 12 4.5l10 5-10 5z" />
            <path d="M6 11.5v4.5c3.5 2.5 8.5 2.5 12 0v-4.5" />
            <path d="M22 9.5V15" />
        </>
    ),
    admin: <path d="M14.5 4a5 5 0 0 0-4.6 6.9L3 17.8 6.2 21l6.9-6.9A5 5 0 0 0 20 9.5l-3 3-3-1-1-3z" />,
    primary: <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />,
}
// the roles of info.roles.items, in their order
export const ROLE_ICONS = ['user', 'owner', 'admin', 'primary']

/** An icon of ICON_PATHS in the current colour. */
export const Icon = ({name, size = 20}) =>
    ICON_PATHS[name] ? (
        <svg className="infoicon" data-icon={name} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICON_PATHS[name]}
        </svg>
    ) : null
export const EDUCATIONAL_IMAGE = 'educatief'
export const imageUrl = (language, name) => `${import.meta.env.BASE_URL}info/${language}/${name}.webp`

/** The form does not send anything: it opens the visitor's own mail program with a new message to the address of this installation. */
export const mailtoUrl = (to, name, message) =>
    `mailto:${to}?subject=${encodeURIComponent('Plugged' + (name ? ' - ' + name : ''))}&body=${encodeURIComponent(message + (name ? '\n\n' + name : ''))}`

export const ContactForm = ({to}) => {
    const {t} = useTranslation()
    const [form, setForm] = useState({name: '', message: ''}),
        [opened, setOpened] = useState(false),
        setField = (field) => (event) => setForm({...form, [field]: event.target.value})
    const submit = (event) => {
        event.preventDefault()
        const link = document.createElement('a')
        link.href = mailtoUrl(to, form.name.trim(), form.message.trim())
        link.click()
        setOpened(true)
    }
    return (
        <form id="contact-form" className="contactform" onSubmit={submit}>
            <label htmlFor="contact-name">{t('info.contact.name')}</label>
            <input id="contact-name" maxLength={100} value={form.name} onChange={setField('name')} />
            <label htmlFor="contact-message">{t('info.contact.message')}</label>
            <textarea id="contact-message" required maxLength={1500} rows={6} value={form.message} onChange={setField('message')} />
            <div>
                <button id="contact-send" type="submit" className="accent">
                    {t('info.contact.send')}
                </button>
            </div>
            <p id="contact-hint" className="cstatus">
                {opened ? t('info.contact.opened') : t('info.contact.explanation')} {t('info.contact.nothingOpens')}{' '}
                <a id="contact-address" href={'mailto:' + to}>
                    {to}
                </a>
                .
            </p>
        </form>
    )
}

/** The donate button: the PayPal link of this installation, or disabled with the setting to fill in. */
const DonateButton = ({id, url, big}) => {
    const {t} = useTranslation()
    const className = 'donate' + (big ? ' big' : '')
    return url ? (
        <a id={id} className={className} href={url} target="_blank" rel="noopener noreferrer">
            ♥ {t('info.support.donate')}
        </a>
    ) : (
        <button id={id} className={className} disabled title={t('info.support.notConfigured')}>
            ♥ {t('info.support.donate')}
        </button>
    )
}

const SourceLink = ({id}) => {
    const {t} = useTranslation()
    return (
        <a id={id} className="sourcelink" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                    fill="currentColor"
                    d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
                />
            </svg>
            {t('info.hero.source')}
        </a>
    )
}

/** A screenshot: shown small, a click opens it large. Hidden when the picture is missing (e.g. not made yet for a new language). */
const Shot = ({name, alt, onOpen}) => {
    const {t, language} = useTranslation()
    const [missing, setMissing] = useState(false)
    if (missing) return null
    const src = imageUrl(language, name),
        // its size, so the page does not shift while it loads (and a jump from the navigation lands where it should)
        [width, height] = SCREENSHOT_SIZES[language]?.[name] || SCREENSHOT_SIZES.nl?.[name] || []
    return (
        <figure className="shot">
            <button type="button" id={'shot-' + name} className="shotbutton" onClick={() => onOpen({src, alt})} title={t('info.features.enlarge')}>
                <img src={src} alt={alt} loading="lazy" width={width} height={height} onError={() => setMissing(true)} />
            </button>
        </figure>
    )
}

/** A large screenshot over the page; Escape, a click on it or the cross closes it. */
const Lightbox = ({image, onClose}) => {
    const {t} = useTranslation()
    useEffect(() => {
        const onKeyDown = (event) => event.key === 'Escape' && onClose()
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    }, [onClose])
    return (
        <div id="info-lightbox" className="lightbox" role="dialog" aria-modal="true" aria-label={image.alt} onClick={onClose}>
            <img src={image.src} alt={image.alt} />
            <button id="info-lightbox-close" type="button" aria-label={t('info.features.close')} onClick={onClose}>
                ✕
            </button>
        </div>
    )
}

const Points = ({items, className}) =>
    items?.length ? (
        <ul className={className}>
            {items.map((item, index) => (
                <li key={index}>
                    {renderInline(item)}
                </li>
            ))}
        </ul>
    ) : null

/**
 * The server tells what this installation offers: a PayPal link (plugged.donate.paypal-url) and the address of the contact form
 * (plugged.admin.email). onTour starts the guided tour. `visitor`: somebody who is not signed in (the page is public, #info): instead of
 * the tour the top offers signing in and, when `onRegister` is given, registering.
 */
export default function InfoPage({onTour, visitor, onLogin, onRegister}) {
    const {t} = useTranslation()
    const [info, setInfo] = useState({donateUrl: '', contactEmail: ''}),
        [enlarged, setEnlarged] = useState(null)
    useEffect(() => {
        let live = true
        fetchInfo().then((answer) => live && setInfo(answer))
        return () => {
            live = false
        }
    }, [])
    const features = translation('info.features.items'),
        roles = translation('info.roles.items'),
        shortcuts = translation('info.shortcuts.items'),
        questions = translation('info.faq.questions')
    return (
        <div id="info-page" className="infopage">
            <header id="info-hero" className="infohero">
                <div className="herotext">
                    <h1>Plugged</h1>
                    <p className="tagline">{t('info.hero.tagline')}</p>
                    <p className="herofree">{t('info.hero.free')}</p>
                    <div className="heroactions">
                        {visitor && onLogin && (
                            <a id="info-login" className="herobutton" href="#" onClick={onLogin}>
                                {t('auth.login.title')}
                            </a>
                        )}
                        {visitor && onRegister && (
                            <a id="info-register" className="herobutton outline" href="#register" onClick={onRegister}>
                                {t('auth.register.title')}
                            </a>
                        )}
                        {onTour && (
                            <button id="btn-tour" className="accent" onClick={onTour}>
                                ▶ {t('info.startTour')}
                            </button>
                        )}
                        <DonateButton id="donate-button" url={info.donateUrl} big />
                        <SourceLink id="source-link" />
                    </div>
                    {onTour && <p className="tourhint">{t('info.tourHint')}</p>}
                    {visitor && <p className="tourhint">{t(onRegister ? 'info.hero.visitorHint' : 'info.hero.visitorHintNoRegister')}</p>}
                    <p className="donatehint">{t('info.hero.donateHint')}</p>
                </div>
                <Shot name="eendraadschema" alt={t('info.hero.imageAlt')} onOpen={setEnlarged} />
            </header>

            <nav className="infonav" aria-label={t('info.navigation')}>
                {SECTIONS.map((id) => (
                    <button key={id} id={'nav-' + id} className={id === 'info-steun' ? 'navdonate' : ''} onClick={() => scrollToSection(id)}>
                        {id === 'info-steun' ? '♥ ' : ''}
                        {t('info.sections.' + id)}
                    </button>
                ))}
            </nav>

            <section id="info-over">
                <h2>{t('info.about.title')}</h2>
                <RichText text={translation('info.about.paragraphs')} />
                <p className="note">{t('info.about.note')}</p>
            </section>

            <section id="info-functies">
                <h2>{t('info.features.title')}</h2>
                <p>{t('info.features.intro')}</p>
                {features.map((feature, index) => {
                    const images = FEATURE_IMAGES[feature.id] || []
                    return (
                        <article key={feature.id} id={'feature-' + feature.id} className={'feature' + (images.length ? '' : ' noimage') + (index % 2 ? ' flip' : '')}>
                            <div className="featuretext">
                                <h3>
                                    <span className="featureicon" aria-hidden="true">
                                        <Icon name={feature.id} />
                                    </span>
                                    {feature.title}
                                </h3>
                                <RichText text={feature.text} />
                                <Points items={feature.points} className="points" />
                            </div>
                            {images.length > 0 && (
                                <div className="featureshots">
                                    {images.map((name) => (
                                        <Shot key={name} name={name} alt={feature.title} onOpen={setEnlarged} />
                                    ))}
                                </div>
                            )}
                        </article>
                    )
                })}
            </section>

            <section id="info-rollen">
                <h2>{t('info.roles.title')}</h2>
                <p>{t('info.roles.intro')}</p>
                <div className="roles">
                    {roles.map((role, index) => (
                        <div key={index} className="role" id={'role-' + (index + 1)}>
                            <div className="roleicon" aria-hidden="true">
                                <Icon name={ROLE_ICONS[index]} />
                            </div>
                            <h3>{role.title}</h3>
                            <p>{renderInline(role.text)}</p>
                        </div>
                    ))}
                </div>
                <div className="twocolumns">
                    <div>
                        <h3>{t('info.roles.groupsTitle')}</h3>
                        <Points items={translation('info.roles.groups')} className="points" />
                    </div>
                    <div>
                        <h3>{t('info.roles.accountTitle')}</h3>
                        <Points items={translation('info.roles.account')} className="points" />
                    </div>
                </div>
                <Shot name={ROLE_IMAGE} alt={t('info.roles.imageAlt')} onOpen={setEnlarged} />
            </section>

            <section id="info-educatief">
                <h2 className="iconheading">
                    <span className="featureicon" aria-hidden="true">
                        <Icon name="owner" />
                    </span>
                    {t('info.educational.title')}
                </h2>
                <p>{renderInline(t('info.educational.intro'))}</p>
                <div className="twocolumns">
                    <div className="cannot">
                        <h3>✖ {t('info.educational.cannotTitle')}</h3>
                        <Points items={translation('info.educational.cannot')} className="points" />
                    </div>
                    <div className="can">
                        <h3>✔ {t('info.educational.canTitle')}</h3>
                        <Points items={translation('info.educational.can')} className="points" />
                    </div>
                </div>
                <p>{renderInline(t('info.educational.teacher'))}</p>
                <Shot name={EDUCATIONAL_IMAGE} alt={t('info.educational.imageAlt')} onOpen={setEnlarged} />
            </section>

            <section id="info-sneltoetsen">
                <h2>{t('info.shortcuts.title')}</h2>
                <dl className="keys">
                    {shortcuts.map((shortcut) => (
                        <div key={shortcut.keys}>
                            <dt>
                                <kbd>{shortcut.keys}</kbd>
                            </dt>
                            <dd>{shortcut.text}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section id="info-faq">
                <h2>{t('info.faq.title')}</h2>
                {questions.map((question, index) => (
                    <details key={index} id={'faq-' + (index + 1)} className="faq">
                        <summary>{question.question}</summary>
                        <p>{question.answer}</p>
                    </details>
                ))}
            </section>

            <section id="info-contact">
                <h2>{t('info.contact.title')}</h2>
                <p>{t('info.contact.intro')}</p>
                {info.contactEmail ? (
                    <ContactForm to={info.contactEmail} />
                ) : (
                    <p id="contact-disabled" className="note">
                        {t('info.contact.disabled')}
                    </p>
                )}
            </section>

            <section id="info-steun" className="supportbox">
                <h2>♥ {t('info.support.title')}</h2>
                <p>{t('info.support.text')}</p>
                <div className="heroactions">
                    <DonateButton id="donate-button-bottom" url={info.donateUrl} big />
                    <SourceLink id="source-link-bottom" />
                </div>
                <p className="cstatus">{t('info.support.contribute')}</p>
            </section>
            {enlarged && <Lightbox image={enlarged} onClose={() => setEnlarged(null)} />}
        </div>
    )
}
