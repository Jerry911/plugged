// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The steps of the guided tour (see Tour.jsx for what a step can contain). The targets are data-tour="..." attributes in the editor:
// they keep the tour working when classes or ids of the editor change.
import {FIT_SHEET_LEN, parseLen, scaleOf} from './geometry.jsx'

const nodes = (t) => t.flatMap((n) => [n, ...nodes(n.children || [])])
const countNodes = (p, pred) => p.een.reduce((a, g) => a + nodes(g.tree).filter(pred).length, 0)
const countItems = (p, pred) => p.sit.reduce((a, g) => a + g.items.filter(pred).length, 0)
const countWalls = (p) => p.sit.reduce((a, g) => a + g.walls.length, 0)
const KADERINFO = '[role="dialog"][aria-label="Kaderinfo"]'
// the Kaderinfo steps: the second one is finished by closing the dialog, but only when it was seen open (a skipped first step must not finish it)
let sawKaderinfo = false
const at = (id) => `[data-tour="${id}"]`
const B = ({children}) => <b>{children}</b>
const K = ({children}) => <kbd>{children}</kbd>

// `place` keeps the card off what the person is about to create: the circuit grows next to the bus, the walls and symbols appear on the plan
export const TOUR_STEPS = [
    {
        id: 'welkom',
        tab: 0,
        title: 'Welkom bij Plugged 👋',
        body: (
            <>
                <p>
                    In enkele minuten teken je een eerste <B>kring</B>, een paar <B>muren</B> en een <B>deur</B>, en weet je waar alles staat. Je mag onderweg zelf
                    klikken: de rondleiding wacht op jou.
                </p>
                <p>
                    Niets van wat je nu tekent is verloren: je kan alles wissen of met <K>Ctrl</K>+<K>Z</K> ongedaan maken.
                </p>
            </>
        ),
        next: 'Start rondleiding',
    },
    {
        id: 'tabs',
        tab: 0,
        target: ['#tab-een', '#tab-sit', '#tab-comp'],
        place: 'bottom',
        title: 'Twee schema’s in één project',
        body: (
            <p>
                Het <B>eendraadschema</B> toont de elektrische opbouw: bord, kringen en toestellen. Het <B>situatieschema</B> toont waar alles op de plattegrond zit. Onder{' '}
                <B>Components</B> beheer je de symbolen en teken je er zelf.
            </p>
        ),
    },
    {
        id: 'palet',
        tab: 0,
        target: at('eds-palette'),
        place: 'right',
        title: 'Het palet',
        body: (
            <p>
                Hier staan alle elementen die je kan toevoegen, per categorie. <B>Klik</B> op een element om het toe te voegen of <B>sleep</B> het naar het schema. Zoek je
                iets? Typ het in <B>Zoek element…</B>.
            </p>
        ),
    },
    {
        id: 'kring',
        tab: 0,
        target: at('pal-kring'),
        place: 'bottom',
        title: 'Maak je eerste kring',
        body: (
            <p>
                Klik op <B>Kring (automaat)</B>. De kring verschijnt onder het verdeelbord en krijgt automatisch de eerstvolgende letter.
            </p>
        ),
        watch: ({p}) => countNodes(p, (n) => n.type === 'kring'),
        done: 'Je eerste kring staat op het schema!',
    },
    {
        id: 'eigenschappen',
        tab: 0,
        target: at('eds-props'),
        missing: 'Klik op een element in het schema (of in de boom onderaan het palet) om zijn eigenschappen te zien.',
        place: 'right',
        title: 'Eigenschappen',
        body: (
            <p>
                Een nieuw element is meteen geselecteerd. In <B>Eigenschappen</B> pas je alles aan: de letter of tekst, de beveiliging (automaat of differentieel), de
                waarden en de kabel. Onderaan staan knoppen om een element te verplaatsen, te dupliceren, te draaien of te verwijderen. Zo werkt het voor élk element.
            </p>
        ),
    },
    {
        id: 'stopcontact',
        tab: 0,
        target: at('pal-stopcontact'),
        place: 'bottom',
        title: 'Hang er een stopcontact aan',
        body: (
            <p>
                Met de kring nog geselecteerd klik je op <B>Stopcontact</B>: het komt automatisch onder die kring. Op dezelfde manier voeg je lampen, schakelaars en
                toestellen toe.
            </p>
        ),
        watch: ({p}) => countNodes(p, (n) => n.type !== 'kring'),
        done: 'Het stopcontact hangt aan je kring.',
    },
    {
        id: 'tekening',
        tab: 0,
        target: '#eds-sheet-1',
        place: 'corner',
        title: 'Het schema tekent zichzelf',
        body: (
            <p>
                Wat je toevoegt, verschijnt meteen op het blad. Klik op een element in de tekening om het te selecteren, of sleep een element uit het palet naar de
                tekening: een blauw voorbeeld toont waar het terechtkomt. Past het niet meer op één blad, dan maakt Plugged zelf een volgend blad.
            </p>
        ),
    },
    {
        id: 'bladen',
        tab: 0,
        target: at('pagebar'),
        place: 'bottom',
        title: 'Bladen en controle',
        body: (
            <p>
                Met <B>＋ blad</B> voeg je een blad toe (✎ hernoemt, ⧉ dupliceert, ◀ ▶ verplaatst). <B>Controleer</B> zoekt fouten en waarschuwingen in je schema: klik op
                een melding om naar het element te springen.
            </p>
        ),
    },
    {
        id: 'naar-situatie',
        target: '#tab-sit',
        place: 'bottom',
        title: 'Naar de plattegrond',
        body: (
            <p>
                Tijd voor het <B>situatieschema</B>. Klik op dit tabblad.
            </p>
        ),
        watch: ({tab}) => tab === 1,
        base: 0,
        done: 'Welkom op de plattegrond.',
    },
    {
        id: 'muur',
        tab: 1,
        target: at('tool-wall'),
        place: 'corner',
        title: 'Teken je eerste muur',
        body: (
            <>
                <p>
                    <B>1.</B> Klik op <B>Muur</B> (het actieve gereedschap kleurt geel).
                    <br />
                    <B>2.</B> Klik op het blad links bovenaan om te beginnen en klik daaronder nog een keer: dat is je eerste muur.
                </p>
                <p>
                    Liever een rechthoek in één keer? Kies <B>Kamer</B> en typ bv. <K>4x3,5</K>.
                </p>
            </>
        ),
        watch: ({p}) => countWalls(p),
        done: 'Je eerste muur staat. Plugged tekent nu verder vanaf het laatste punt.',
    },
    {
        id: 'muur-lengte',
        tab: 1,
        target: at('dimbox'),
        fallback: at('tool-wall'),
        missing: 'Het vak Lengte verschijnt zodra je met Muur een eerste punt hebt gezet: teken eerst je eerste muur met twee klikken.',
        place: 'corner',
        title: 'Een muur met een exacte lengte',
        body: (
            <>
                <p>
                    Onder het blad staat nu het vak <B>Lengte</B>. Hier typ je een maat in meter, zonder dat je de muur hoeft te tekenen.
                </p>
                <p>
                    Typ <K>15</K> (15 meter: bewust te lang voor dit blad) en druk op <K>→</K> om naar rechts te tekenen. Druk nog niet op Enter.
                </p>
            </>
        ),
        // done when the typed length is large enough for the application to propose another scale, but still fits on the sheet afterwards
        watch: ({p}) => {
            const m = parseLen(document.querySelector(at('dim-input'))?.value),
                sc = scaleOf(p.footer)
            return m != null && m > (FIT_SHEET_LEN * sc) / 1000 && m <= Math.floor((FIT_SHEET_LEN * sc) / 1000) + 2 && document.querySelector(at('dim-scale')) ? 1 : 0
        },
        done: 'Te lang voor het blad: Plugged merkt het en stelt een andere schaal voor.',
    },
    {
        id: 'schaal-kiezen',
        tab: 1,
        target: at('dim-scale'),
        fallback: at('dimbox'),
        missing: 'Typ eerst 15 in het vak Lengte (en druk op →): dan verschijnt hier de knop Schaal.',
        place: 'corner',
        title: 'Kies een passende schaal',
        body: (
            <>
                <p>
                    Een tekening heeft een <B>schaal</B>: bij 1:50 is 1 mm op het blad 50 mm in het echt. Het blad is maar 297 mm breed, dus 15 m past niet bij 1:50.
                </p>
                <p>
                    Plugged stelt de kleinste schaal voor waarbij het wel past. Klik op de knop <B>Schaal</B> naast het vak (bv. 1:75).
                </p>
            </>
        ),
        watch: ({p}) => scaleOf(p.footer),
        done: 'Schaal aangepast!',
    },
    {
        id: 'muur-bevestig',
        tab: 1,
        target: at('dimbox'),
        fallback: at('tool-wall'),
        missing: 'Het vak Lengte is weg. Kies Muur en klik op het uiteinde van je eerste muur om verder te tekenen, typ 15 en druk op Enter.',
        place: 'corner',
        title: 'Bevestig de lengte',
        body: (
            <>
                <p>
                    De blauwe voorvertoning toont je tweede muur op de nieuwe schaal. Druk op <K>Enter</K> (of klik <B>OK</B>) om hem te plaatsen.
                </p>
                <p>
                    Let op: je eerste muur bleef even lang op het blad, maar de maat die erbij staat is veranderd. De <B>schaal</B> bepaalt wat het blad in het echt betekent.
                </p>
            </>
        ),
        watch: ({p}) => countWalls(p),
        done: 'Tweede muur geplaatst. Rechtsklik op het blad om te stoppen met muren.',
    },
    {
        id: 'kaderinfo',
        target: '#btn-footer',
        place: 'bottom',
        title: 'Waar staat de schaal?',
        body: (
            <p>
                De schaal staat onderaan elk blad, in het vak <B>Datum / Schaal</B>. Je bekijkt en wijzigt ze in de <B>Kaderinfo</B>. Klik op de gele knop <B>✎ Kaderinfo</B>.
            </p>
        ),
        watch: () => {
            sawKaderinfo = !!document.querySelector(KADERINFO)
            return sawKaderinfo ? 1 : 0
        },
        base: 0,
        done: 'Kaderinfo is open.',
    },
    {
        id: 'kaderinfo-schaal',
        target: at('footer-schaal'),
        fallback: '#btn-footer',
        missing: 'Open eerst de Kaderinfo met de gele knop bovenaan.',
        place: 'left',
        title: 'De schaal bekijken en aanpassen',
        body: (
            <>
                <p>
                    In het veld <B>Schaal</B> staat wat je net koos. Wil je een andere schaal, bv. <K>1:100</K> voor een groter huis? Typ ze hier: alle maten bij de muren rekenen
                    dan mee.
                </p>
                <p>
                    Sluit het venster met <B>✕</B> om verder te gaan.
                </p>
            </>
        ),
        watch: () => {
            if (document.querySelector(KADERINFO)) {
                sawKaderinfo = true
                return 0
            }
            return sawKaderinfo ? 1 : 0
        },
        base: 0,
        done: 'Mooi, de schaal staat vast.',
    },
    {
        id: 'deur',
        tab: 1,
        target: at('tool-door'),
        place: 'corner',
        title: 'Plaats een deur',
        body: (
            <p>
                Klik op <B>Deur</B> en daarna op een muur: de deur klikt vast op de muur en draait mee. Een <B>Raam</B> plaats je op dezelfde manier.
            </p>
        ),
        watch: ({p}) => countItems(p, (it) => it.kind === 'door'),
        done: 'De deur zit op zijn plaats.',
    },
    {
        id: 'symbool',
        tab: 1,
        target: at('comp-palette'),
        place: 'corner',
        title: 'Plaats een symbool',
        body: (
            <p>
                Onder <B>Componenten</B> staan alle symbolen. Klik op een symbool, bv. <B>Stopcontact</B>, en klik daarna op het blad om het te plaatsen. Zoek je er een?
                Typ in <B>Zoek een algemeen component</B>.
            </p>
        ),
        watch: ({p}) => countItems(p, (it) => it.kind === 'sym'),
        done: 'Symbool geplaatst.',
    },
    {
        id: 'nergens-geplaatst',
        tab: 1,
        target: at('unplaced'),
        place: 'left',
        title: 'Nergens geplaatst',
        body: (
            <p>
                Alles wat je in het eendraadschema tekende, staat ook op de plattegrond thuis. Wat nog niet geplaatst is, verschijnt in dit paneel: klik een item en dan
                op het blad, of laat Plugged ze verdelen met <B>Plaats ontbrekende op dit blad</B>. Zo vergeet je nooit een toestel.
            </p>
        ),
    },
    {
        id: 'selecteer',
        tab: 1,
        target: at('tool-select'),
        place: 'corner',
        title: 'Selecteer je deur of symbool',
        body: (
            <p>
                Klik op <B>Selecteer</B> (of rechtsklik op het blad) en klik dan op de deur of het symbool dat je net plaatste.
            </p>
        ),
        watch: () => (document.getElementById('sit-props') ? 1 : 0),
        base: 0,
        done: 'Geselecteerd.',
    },
    {
        id: 'eigenschappen-situatie',
        tab: 1,
        target: '#sit-props',
        missing: 'Selecteer eerst een deur of symbool: dan verschijnt dit paneel.',
        place: 'corner',
        title: 'Eigenschappen van een symbool',
        body: (
            <p>
                Hier pas je het geselecteerde aan: draaien met ⟲ ⟳ (of <K>R</K>), spiegelen, vergroten of verkleinen, een eigen tekst bij het symbool zetten en kopiëren.
                Met <K>Del</K> verwijder je het. Een muur heeft hier een exacte lengte.
            </p>
        ),
    },
    {
        id: 'project',
        target: '#tab-project',
        place: 'bottom',
        title: 'Vergeet niet op te slaan',
        body: (
            <p>
                Plugged bewaart niet automatisch. Onder <B>Project</B> sla je op (<K>Ctrl</K>+<K>S</K>), begin je een nieuw project, laad je een ander of importeer en
                exporteer je (.json of .eds). Rechts in de balk staan <B>PDF</B> en <B>Afdrukken</B>.
            </p>
        ),
    },
    {
        id: 'klaar',
        target: '#tab-info',
        place: 'bottom',
        title: 'Klaar! Hulp vind je onder Info',
        body: (
            <>
                <p>
                    Daar staan de uitleg, de sneltoetsen en de veelgestelde vragen, en kan je deze rondleiding opnieuw starten.
                </p>
                <p>
                    De kring, muren en deur die je net tekende staan nog in je project. Wil je ze liever niet, begin dan met een leeg project.
                </p>
            </>
        ),
        next: 'Klaar',
        extra: {label: 'Leeg project starten', run: (ctx) => ctx.onNew?.()},
    },
]
