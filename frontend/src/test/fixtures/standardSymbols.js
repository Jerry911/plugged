// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The standard symbols as the backend serves them to a new installation: the catalog that ships with the application
// (backend/src/main/resources/catalog/standard-symbols.json, made with Beheer → Symbolen), as stored copies that nobody edited.
// The tests use them as the active symbol library (src/test/setup.js), so they always test the symbols that ship.
import catalog from '../../../../backend/src/main/resources/catalog/standard-symbols.json'

// what StandardSymbols.VERSION gives the stored copies; nothing in the frontend depends on its value
export const STANDARD_VERSION = 11

export default catalog.map((symbol) => ({...symbol, v: STANDARD_VERSION, builtin: true, modified: false}))
