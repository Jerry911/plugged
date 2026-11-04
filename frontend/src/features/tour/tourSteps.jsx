// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The steps of the guided tour (see Tour.jsx for what a step can contain). The texts are in the translations (tour.steps.<id>); the targets
// are data-tour="..." attributes and ids of the editor.
import {FIT_SHEET_LENGTH, parseLength, scaleOf} from '../../model/geometry.js'
import {flatten} from '../../model/tree.js'
import {translation} from '../../i18n/translate.js'
import RichText from '../../i18n/RichText.jsx'

const countNodes = (project, matches) => project.een.reduce((sum, page) => sum + flatten(page.tree).filter(matches).length, 0)
const countItems = (project, matches) => project.sit.reduce((sum, page) => sum + page.items.filter(matches).length, 0)
const countWalls = (project) => project.sit.reduce((sum, page) => sum + page.walls.length, 0)
const FOOTER_DIALOG = '#footer-dialog'
// the Kaderinfo steps: the second one is finished by closing the dialog, but only when it was seen open (a skipped first step must not finish it)
let footerDialogSeen = false
const tourTarget = (name) => `[data-tour="${name}"]`

// The texts of a step in the active language: title, body (paragraphs with **bold** and [[keys]]) and the optional missing, done, next and
// extra label.
const textsOf = (id) => {
    const texts = translation('tour.steps.' + id) || {}
    return {
        title: texts.title,
        body: <RichText text={texts.body} />,
        ...(texts.missing ? {missing: texts.missing} : {}),
        ...(texts.done ? {done: texts.done} : {}),
        ...(texts.next ? {next: texts.next} : {}),
    }
}

/**
 * The steps in the active language (call it again after the language changed). `place` keeps the card off what the person is about to create:
 * the circuit grows next to the bus, the walls and symbols appear on the plan.
 */
export const tourSteps = () => [
    {id: 'welkom', tab: 0, ...textsOf('welkom')},
    {id: 'tabs', tab: 0, target: ['#tab-een', '#tab-sit', '#tab-comp'], place: 'bottom', ...textsOf('tabs')},
    {id: 'palet', tab: 0, target: tourTarget('eds-palette'), place: 'right', ...textsOf('palet')},
    {
        id: 'kring',
        tab: 0,
        target: tourTarget('pal-kring'),
        place: 'bottom',
        watch: ({project}) => countNodes(project, (node) => node.type === 'kring'),
        ...textsOf('kring'),
    },
    {id: 'eigenschappen', tab: 0, target: tourTarget('eds-props'), place: 'right', ...textsOf('eigenschappen')},
    {
        id: 'stopcontact',
        tab: 0,
        target: tourTarget('pal-stopcontact'),
        place: 'bottom',
        watch: ({project}) => countNodes(project, (node) => node.type !== 'kring'),
        ...textsOf('stopcontact'),
    },
    {id: 'tekening', tab: 0, target: '#eds-sheet-1', place: 'corner', ...textsOf('tekening')},
    {id: 'bladen', tab: 0, target: tourTarget('pagebar'), place: 'bottom', ...textsOf('bladen')},
    {id: 'naar-situatie', target: '#tab-sit', place: 'bottom', watch: ({tab}) => tab === 1, base: 0, ...textsOf('naar-situatie')},
    {id: 'muur', tab: 1, target: tourTarget('tool-wall'), place: 'corner', watch: ({project}) => countWalls(project), ...textsOf('muur')},
    {
        id: 'muur-lengte',
        tab: 1,
        target: tourTarget('dimbox'),
        fallback: tourTarget('tool-wall'),
        place: 'corner',
        // done when the typed length is large enough for the application to propose another scale, but still fits on the sheet afterwards
        watch: ({project}) => {
            const metres = parseLength(document.querySelector(tourTarget('dim-input'))?.value),
                scale = scaleOf(project.footer),
                longestThatFits = (FIT_SHEET_LENGTH * scale) / 1000
            const needsOtherScale = metres != null && metres > longestThatFits && metres <= Math.floor(longestThatFits) + 2
            return needsOtherScale && document.querySelector(tourTarget('dim-scale')) ? 1 : 0
        },
        ...textsOf('muur-lengte'),
    },
    {
        id: 'schaal-kiezen',
        tab: 1,
        target: tourTarget('dim-scale'),
        fallback: tourTarget('dimbox'),
        place: 'corner',
        watch: ({project}) => scaleOf(project.footer),
        ...textsOf('schaal-kiezen'),
    },
    {
        id: 'muur-bevestig',
        tab: 1,
        target: tourTarget('dimbox'),
        fallback: tourTarget('tool-wall'),
        place: 'corner',
        watch: ({project}) => countWalls(project),
        ...textsOf('muur-bevestig'),
    },
    {
        id: 'kaderinfo',
        target: '#btn-footer',
        place: 'bottom',
        watch: () => {
            footerDialogSeen = !!document.querySelector(FOOTER_DIALOG)
            return footerDialogSeen ? 1 : 0
        },
        base: 0,
        ...textsOf('kaderinfo'),
    },
    {
        id: 'kaderinfo-schaal',
        target: tourTarget('footer-schaal'),
        fallback: '#btn-footer',
        place: 'left',
        watch: () => {
            if (document.querySelector(FOOTER_DIALOG)) {
                footerDialogSeen = true
                return 0
            }
            return footerDialogSeen ? 1 : 0
        },
        base: 0,
        ...textsOf('kaderinfo-schaal'),
    },
    {id: 'deur', tab: 1, target: tourTarget('tool-door'), place: 'corner', watch: ({project}) => countItems(project, (item) => item.kind === 'door'), ...textsOf('deur')},
    {
        id: 'symbool',
        tab: 1,
        target: tourTarget('comp-palette'),
        place: 'corner',
        watch: ({project}) => countItems(project, (item) => item.kind === 'sym'),
        ...textsOf('symbool'),
    },
    {id: 'nergens-geplaatst', tab: 1, target: tourTarget('unplaced'), place: 'left', ...textsOf('nergens-geplaatst')},
    {
        id: 'selecteer',
        tab: 1,
        target: tourTarget('tool-select'),
        place: 'corner',
        watch: () => (document.getElementById('sit-props') ? 1 : 0),
        base: 0,
        ...textsOf('selecteer'),
    },
    {id: 'eigenschappen-situatie', tab: 1, target: '#sit-props', place: 'corner', ...textsOf('eigenschappen-situatie')},
    {id: 'project', target: '#tab-project', place: 'bottom', ...textsOf('project')},
    {
        id: 'klaar',
        target: '#tab-info',
        place: 'bottom',
        extra: {label: translation('tour.steps.klaar.extra'), run: (context) => context.onNew?.()},
        ...textsOf('klaar'),
    },
]
