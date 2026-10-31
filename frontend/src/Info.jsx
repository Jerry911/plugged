// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useState} from 'react'

const SECTIONS = [
    ['info-over', 'Over'],
    ['info-gebruik', 'Gebruik'],
    ['info-faq', 'FAQ'],
    ['info-contact', 'Contact'],
    ['info-steun', 'Steun'],
]
const STEPS = [
    [
        'Eendraadschema tekenen',
        'Een nieuw project start met een aansluiting (kWh-meter) en een verdeelbord. Kies in het palet links "Kring (automaat)" om een kring toe te voegen en klik daarna op de elementen die erbij horen (stopcontact, lamp, schakelaar, ...). Je kan een element ook naar de tekening slepen: een blauw voorbeeld toont waar het terechtkomt. Zoek snel via het zoekveld "Zoek element…".',
    ],
    [
        'Eigenschappen en opbouw',
        'Klik een element aan om het te bewerken: het paneel Eigenschappen (boven Opbouw) bevat het label, de beveiliging, de kabel, ... en een werkbalk om te verplaatsen, te dupliceren, te draaien of te verwijderen. Opbouw toont het hele schema als boom; de pijl bij een hoofdniveau klapt alles eronder in of uit.',
    ],
    [
        'Kaderinfo invullen',
        'Klik op een vak onderaan het blad (of op de gele knop "Kaderinfo") om titel, adres, eigenaar, tekenaar, datum en dergelijke in te vullen. Die info staat onderaan elk blad, ook in de PDF.',
    ],
    [
        'Situatieschema maken',
        'Teken op het tabblad Situatieschema muren, ruimtes, deuren en ramen op het raster en plaats er de symbolen van je eendraadschema op. Klik links een component aan om hem te plaatsen; het paneel "Nergens geplaatst" rechts toont wat nog ontbreekt. Een rechtermuisklik annuleert wat je aan het tekenen bent.',
    ],
    [
        'Eigen symbolen',
        'Op het tabblad Components vind je alle symbolen. Je kan er symbolen aanpassen, dupliceren of een volledig nieuw symbool tekenen op een raster van 24 x 24.',
    ],
    [
        'Controleren',
        'De knop "Controleer" toont fouten en waarschuwingen van het eendraadschema. Klik op een melding om naar het element te springen.',
    ],
    [
        'Bewaren, importeren en exporteren',
        'Op het tabblad "Project" geef je het project een naam en bewaar je het met "Opslaan" (of Ctrl+S) op de server. "Opslaan als…" bewaart een kopie als nieuw project, "Nieuw" begint een leeg project en "Laden" toont de lijst met opgeslagen projecten, met naam en datum van de laatste keer opslaan. "Importeren" opent een .json (projectbestand) of een .eds (van eendraadschema.goethals-jacobs.be). "Exporteren" laat je kiezen tussen .json en .eds. "PDF" maakt een vectoriële PDF (A4 liggend) van alle bladen, "Afdrukken" opent het afdrukvenster van je browser.',
    ],
]
const KEYS = [
    ['Del / Backspace', 'verwijdert het geselecteerde element, de muur of het symbool'],
    ['Ctrl+Z', 'ongedaan maken'],
    ['Ctrl+Y of Ctrl+Shift+Z', 'opnieuw'],
    ['R', 'draait de selectie in het situatieschema'],
]
const FAQ = [
    [
        'Wordt mijn werk automatisch bewaard?',
        'Nee. Pas als je op "Opslaan" klikt, wordt het project bewaard op de server. Maak daarnaast af en toe een back-up via Exporteren → Projectbestand (.json).',
    ],
    [
        'Kan ik meerdere projecten bewaren?',
        'Ja. Elk project heeft een naam en een nummer (dat nummer geeft de server zelf). Via Project → Laden kies je een opgeslagen project; zijn er niet-opgeslagen wijzigingen, dan vraagt Plugged eerst om bevestiging.',
    ],
    [
        'Kan ik een schema uit het online eendraadschema openen?',
        'Ja. Kies "Importeren" en selecteer het .eds-bestand. Enkel het eendraadschema en het adres worden overgenomen; het situatieschema uit het bestand niet. Bestaande plattegronden en muren blijven staan, maar hun symbolen worden gewist omdat het eendraadschema vervangen wordt. Je kan de import ongedaan maken met Ctrl+Z.',
    ],
    [
        'Wat gebeurt er met onbekende elementen bij een import of export?',
        'Elementen die Plugged niet kent, worden bij het importeren "Vrij element". Bij het exporteren naar .eds worden symbolen zonder tegenhanger in dat formaat (zoals eigen componenten) als vrij verbruiker met de naam van het symbool geschreven. De melding bovenaan het scherm somt ze op.',
    ],
    [
        'Hoe maak ik mijn eigen symbool?',
        'Ga naar het tabblad Components en kies "＋ Nieuw component". Teken het symbool, geef het een naam en categorie en bepaal waaronder het mag hangen. Eigen symbolen zitten ook in het geëxporteerde projectbestand, zodat het op een andere installatie opent.',
    ],
    [
        'Zijn de controles bindend?',
        'Nee. De grenswaarden in "Controleer" zijn richtwaarden. Controleer je schema altijd zelf aan de actuele AREI en laat het keuren door een erkend organisme.',
    ],
    [
        'Waarom zie ik een waarschuwing bij Situatieschema?',
        'Het getal telt de elementen van het eendraadschema die nog nergens op een plattegrond staan. Plaats ze via de lijst "Nergens geplaatst".',
    ],
    [
        'Wat is het verschil tussen PDF en Afdrukken?',
        'PDF downloadt een vectorbestand van alle bladen. Afdrukken stuurt dezelfde bladen naar het afdrukvenster van je browser, bijvoorbeeld om ze op papier te zetten.',
    ],
]
const goto = (id) => document.getElementById(id)?.scrollIntoView?.({behavior: 'smooth', block: 'start'})

// The form does not send anything: it opens the visitor's own mail program with a new message to the address of this installation.
export const mailtoUrl = (to, name, message) =>
    `mailto:${to}?subject=${encodeURIComponent('Plugged' + (name ? ' - ' + name : ''))}&body=${encodeURIComponent(message + (name ? '\n\n' + name : ''))}`

export const ContactForm = ({to}) => {
    const [f, setF] = useState({name: '', message: ''}),
        [opened, setOpened] = useState(false),
        set = (k) => (e) => setF({...f, [k]: e.target.value})
    const submit = (e) => {
        e.preventDefault()
        const a = document.createElement('a')
        a.href = mailtoUrl(to, f.name.trim(), f.message.trim())
        a.click()
        setOpened(true)
    }
    return (
        <form id="contact-form" className="contactform" onSubmit={submit}>
            <label htmlFor="contact-name">Naam</label>
            <input id="contact-name" maxLength={100} value={f.name} onChange={set('name')} />
            <label htmlFor="contact-message">Bericht</label>
            <textarea id="contact-message" required maxLength={1500} rows={6} value={f.message} onChange={set('message')} />
            <div>
                <button id="contact-send" type="submit" className="accent">
                    Open e-mailprogramma
                </button>
            </div>
            <p id="contact-hint" className="cstatus">
                {opened ? 'Je e-mailprogramma zou nu moeten openen met je bericht. ' : 'Dit opent een nieuw bericht in je eigen e-mailprogramma; er wordt niets via Plugged verstuurd. '}
                Opent er niets? Mail dan naar <a id="contact-address" href={'mailto:' + to}>{to}</a>.
            </p>
        </form>
    )
}

// The server tells what this installation offers: a PayPal link (plugged.donate.paypal-url) and the address of the contact form (plugged.contact.email)
export default function Info() {
    const [info, setInfo] = useState({donateUrl: '', contactEmail: ''})
    useEffect(() => {
        fetch('/api/info')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setInfo({donateUrl: d.donateUrl || '', contactEmail: d.contactEmail || ''}))
            .catch(() => {})
    }, [])
    return (
        <div id="info-page" className="infopage">
            <h1>Plugged</h1>
            <nav className="infonav" aria-label="Info">
                {SECTIONS.map(([id, t]) => (
                    <button key={id} id={'nav-' + id} onClick={() => goto(id)}>
                        {t}
                    </button>
                ))}
            </nav>

            <section id="info-over">
                <h2>Over Plugged</h2>
                <p>
                    Plugged is een gratis programma om elektrische schema's volgens het Belgische AREI te tekenen in je browser: een eendraadschema met meerdere bladen, een
                    situatieschema op plattegrond, een bibliotheek met symbolen die je zelf kan uitbreiden, een controle op de belangrijkste regels en export naar vectoriële PDF.
                    Bestanden van en naar het online eendraadschema (.eds) worden ondersteund.
                </p>
                <p>
                    Gemaakt door Jeroen Pleysier. Plugged is vrije software onder de GNU Affero General Public License v3.0: je mag het gebruiken, aanpassen en verspreiden, zolang
                    elke aangepaste versie onder dezelfde licentie met broncode beschikbaar blijft.
                </p>
                <p className="note">
                    Plugged is een hulpmiddel. De controles zijn richtwaarden en vervangen de keuring door een erkend organisme of de raadpleging van het AREI niet.
                </p>
            </section>

            <section id="info-gebruik">
                <h2>Hoe gebruik je Plugged?</h2>
                <ol className="steps">
                    {STEPS.map(([t, d]) => (
                        <li key={t}>
                            <b>{t}</b>
                            <p>{d}</p>
                        </li>
                    ))}
                </ol>
                <h3>Sneltoetsen</h3>
                <dl className="keys">
                    {KEYS.map(([k, d]) => (
                        <div key={k}>
                            <dt>
                                <kbd>{k}</kbd>
                            </dt>
                            <dd>{d}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section id="info-faq">
                <h2>Veelgestelde vragen</h2>
                {FAQ.map(([q, a]) => (
                    <details key={q} className="faq">
                        <summary>{q}</summary>
                        <p>{a}</p>
                    </details>
                ))}
            </section>

            <section id="info-contact">
                <h2>Contact</h2>
                <p>Een vraag, een fout gevonden of een idee? Laat het weten.</p>
                {info.contactEmail ? (
                    <ContactForm to={info.contactEmail} />
                ) : (
                    <p id="contact-disabled" className="note">
                        Het contactformulier is op deze installatie niet ingesteld.
                    </p>
                )}
            </section>

            <section id="info-steun">
                <h2>Steun Plugged</h2>
                <p>Plugged is gratis. Wil je de verdere ontwikkeling steunen, dan kan je een vrijwillige bijdrage doen via PayPal. Bedankt!</p>
                {info.donateUrl ? (
                    <a id="donate-button" className="donate" href={info.donateUrl} target="_blank" rel="noopener noreferrer">
                        Doneer via PayPal
                    </a>
                ) : (
                    <button id="donate-button" className="donate" disabled title="Nog niet ingesteld: zie plugged.donate.paypal-url">
                        Doneer via PayPal
                    </button>
                )}
            </section>
        </div>
    )
}
