// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Info tab: about, how to use, shortcuts, FAQ, contact form (opens the visitor's own mail program) and the donate button.
import {useEffect, useState} from 'react'
import {fetchInfo} from '../../api/projectApi.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import RichText from '../../i18n/RichText.jsx'
import {translation} from '../../i18n/translate.js'

const SECTIONS = ['info-over', 'info-gebruik', 'info-faq', 'info-contact', 'info-steun']
const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView?.({behavior: 'smooth', block: 'start'})

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

/**
 * The server tells what this installation offers: a PayPal link (plugged.donate.paypal-url) and the address of the contact form
 * (plugged.contact.email). onTour starts the guided tour.
 */
export default function InfoPage({onTour}) {
    const {t} = useTranslation()
    const [info, setInfo] = useState({donateUrl: '', contactEmail: ''})
    useEffect(() => {
        let live = true
        fetchInfo().then((answer) => live && setInfo(answer))
        return () => {
            live = false
        }
    }, [])
    const steps = translation('info.usage.steps'),
        shortcuts = translation('info.usage.shortcuts'),
        questions = translation('info.faq.questions')
    return (
        <div id="info-page" className="infopage">
            <h1>Plugged</h1>
            {onTour && (
                <p className="tourcta">
                    <button id="btn-tour" className="accent" onClick={onTour}>
                        ▶ {t('info.startTour')}
                    </button>
                    <span>{t('info.tourHint')}</span>
                </p>
            )}
            <nav className="infonav" aria-label={t('info.navigation')}>
                {SECTIONS.map((id) => (
                    <button key={id} id={'nav-' + id} onClick={() => scrollToSection(id)}>
                        {t('info.sections.' + id)}
                    </button>
                ))}
            </nav>

            <section id="info-over">
                <h2>{t('info.about.title')}</h2>
                <RichText text={translation('info.about.paragraphs')} />
                <p className="note">{t('info.about.note')}</p>
            </section>

            <section id="info-gebruik">
                <h2>{t('info.usage.title')}</h2>
                <ol className="steps">
                    {steps.map((step, index) => (
                        <li key={index} id={'info-step-' + (index + 1)}>
                            <b>{step.title}</b>
                            <p>{step.text}</p>
                        </li>
                    ))}
                </ol>
                <h3>{t('info.usage.shortcutsTitle')}</h3>
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

            <section id="info-steun">
                <h2>{t('info.support.title')}</h2>
                <p>{t('info.support.text')}</p>
                {info.donateUrl ? (
                    <a id="donate-button" className="donate" href={info.donateUrl} target="_blank" rel="noopener noreferrer">
                        {t('info.support.donate')}
                    </a>
                ) : (
                    <button id="donate-button" className="donate" disabled title={t('info.support.notConfigured')}>
                        {t('info.support.donate')}
                    </button>
                )}
            </section>
        </div>
    )
}
