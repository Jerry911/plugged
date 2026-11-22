// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The server makes new projects for an AI assistant (MCP tool create_project) from a copy of what a new project of the editor is, one per
// language: backend/src/main/resources/ai/new-project-<language>.json. This test keeps those copies equal to newProject(); after a change
// of the new project, write them again with: UPDATE_TEMPLATES=1 npx vitest run src/test/ai/newProjectTemplates.test.js
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {newProject} from '../../app/projectDocument.js'
import {setLanguage} from '../../i18n/translate.js'

// the tests run in the frontend folder
const fileOf = (language) => resolve(process.cwd(), `../backend/src/main/resources/ai/new-project-${language}.json`)

/** The ids numbered in order (the random ones of newId would differ every time); the date is filled in by the server. */
const normalized = (project) => {
    let next = 0
    const ids = new Map()
    const walk = (value) => {
        if (Array.isArray(value)) return value.map(walk)
        if (value && typeof value === 'object')
            return Object.fromEntries(
                Object.entries(value).map(([key, inner]) => {
                    if (key === 'id' && typeof inner === 'string') {
                        if (!ids.has(inner)) ids.set(inner, 'n' + ++next)
                        return [key, ids.get(inner)]
                    }
                    return [key, walk(inner)]
                }),
            )
        return value
    }
    const result = walk(project)
    result.footer = {...result.footer, datum: ''}
    return result
}

afterAll(() => setLanguage('nl'))

test.each(['nl', 'fr', 'en'])('the new project of the server in %s is the new project of the editor', (language) => {
    setLanguage(language)
    const expected = normalized(newProject())
    if (process.env.UPDATE_TEMPLATES) writeFileSync(fileOf(language), JSON.stringify(expected, null, 2) + '\n')
    expect(existsSync(fileOf(language))).toBe(true)
    expect(JSON.parse(readFileSync(fileOf(language), 'utf8'))).toEqual(expected)
})
