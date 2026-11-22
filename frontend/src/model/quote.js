// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The offerte of a project with a price list (model/pricing.js): which articles, how many, and what it costs.
//   - elements: every element of the eendraadschema (as in the materiaallijst, its Aantal counted) with the articles of its symbol in the
//     price list; its waterproof version (type|h) when it has one;
//   - cover frames: an element that takes places in a frame gets one frame for those places, horizontal unless set otherwise on the
//     situatieschema. Elements combined on the situatieschema (several selected › Combineren) share one frame: the sum of their places, in
//     the direction of the combination. A flush box per place;
//   - protection: the devices of the materiaallijst, each matched with the article of the same kind and specs;
//   - cables: the length of each cable of the materiaallijst (typed or estimated from the plan), rounded up to whole metres;
//   - labour: the minutes of every article times its quantity, at the hourly rate, rounded up to a quarter of an hour;
//   - extra lines of the offerte itself (keuring, travel, ...), and the margin and VAT of the offerte.
// What cannot be priced is not left out silently: it is in `problems` (an element without articles, an article without a price, a cable or
// protective device without an article, a cable without a length, more places than the largest frame).
import {billOfMaterials} from './materials.js'
import {flatten} from './tree.js'
import {ARTICLE_GROUPS, amountOf, cableKey, protectionMatches} from './pricing.js'
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'

const roundCents = (value) => Math.round(value * 100) / 100
const countOf = (node) => Math.max(1, Math.round(Number(node.p?.aantal) || 1))
const DIRECTIONS = new Set(['h', 'v'])

/** The articles of an element type in the price list: the waterproof one first when the element is waterproof. */
const recipeOf = (list, type, waterproof) => (waterproof && list.symbols[type + '|h']) || list.symbols[type] || null

/**
 * The frames the elements need: [{places, direction, count}]. Every plan symbol linked to an element is one piece of it; those combined
 * (same `combo` on a page) share a frame. Pieces of an element that are not on the plan get a frame of their own, horizontal.
 */
export function frameNeeds(project, list) {
    const elements = new Map()
    for (const page of project.een || [])
        for (const node of flatten(page.tree)) {
            const recipe = node.type && recipeOf(list, node.type, !!node.p?.h)
            if (recipe && Number(recipe.places) > 0) elements.set(node.id, {places: Number(recipe.places), pieces: countOf(node)})
        }
    const frames = new Map(),
        add = (places, direction, count = 1) => {
            const key = places + direction
            frames.set(key, {places, direction, count: (frames.get(key)?.count || 0) + count})
        }
    for (const page of project.sit || []) {
        const combos = new Map()
        for (const item of page.items || []) {
            if (item.kind !== 'sym' || !item.node || !elements.has(item.node)) continue
            const element = elements.get(item.node)
            if (element.pieces <= 0) continue
            element.pieces--
            const direction = DIRECTIONS.has(item.dir) ? item.dir : 'h'
            if (item.combo) {
                const combo = combos.get(item.combo) || {places: 0, direction}
                combo.places += element.places
                combos.set(item.combo, combo)
            } else add(element.places, direction)
        }
        for (const combo of combos.values()) add(combo.places, combo.direction)
    }
    for (const element of elements.values()) if (element.pieces > 0) add(element.places, 'h', element.pieces)
    return [...frames.values()].sort((a, b) => a.places - b.places || a.direction.localeCompare(b.direction))
}

/**
 * The offerte: {lines: [{article, group, name, code, unit, qty, cost, price, total, minutes}], labour: {minutes, hours, rate, total},
 * extras: [{text, qty, price, total}], material, subtotal, vat: {rate, amount}, total, problems: [{kind, ...}]}.
 * options: {margin (% on material, else that of the price list), vat (21, 6 or 0), extras: [{text, qty, price}], labour (false: without)}.
 */
export function quoteOf(project, list, options = {}) {
    const articles = new Map(list.articles.map((article) => [article.id, article])),
        quantities = new Map(),
        problems = []
    const add = (articleId, qty, origin) => {
        const article = articles.get(articleId)
        if (!article) return problems.push({kind: 'missingArticle', article: articleId, origin})
        quantities.set(articleId, (quantities.get(articleId) || 0) + qty)
    }
    // the elements
    const noRecipe = new Map()
    for (const page of project.een || [])
        for (const node of flatten(page.tree)) {
            if (!node.type || ['kring', 'aansluiting', 'diff', 'zekering', 'hoofdschakelaar'].includes(node.type)) continue
            const recipe = recipeOf(list, node.type, !!node.p?.h)
            if (!recipe) {
                const name = symbolName(typeOf(project, node.type))
                noRecipe.set(node.type, {kind: 'noArticles', type: node.type, name, count: (noRecipe.get(node.type)?.count || 0) + countOf(node)})
                continue
            }
            for (const part of recipe.parts || []) add(part.article, (amountOf(part.qty) ?? 1) * countOf(node), node.type)
        }
    problems.push(...noRecipe.values())
    // the frames and boxes
    const maxPlaces = (direction) => Math.max(0, ...Object.keys(list.frames[direction] || {}).filter((places) => list.frames[direction][places]).map(Number))
    for (const need of frameNeeds(project, list)) {
        const frame = list.frames[need.direction]?.[need.places] || (need.places === 1 ? list.frames.h?.[1] : null)
        if (frame) add(frame, need.count, 'frame')
        else problems.push({kind: 'noFrame', places: need.places, direction: need.direction, count: need.count, max: maxPlaces(need.direction)})
        if (list.frames.box) add(list.frames.box, need.places * need.count, 'box')
    }
    // protection and cables, as in the materiaallijst
    const bom = billOfMaterials(project)
    for (const device of bom.protection) {
        const article = list.articles.find((candidate) => protectionMatches(candidate, device))
        if (article) add(article.id, device.count, 'protection')
        else problems.push({kind: 'noProtection', description: device.description, count: device.count})
    }
    for (const cable of bom.cables) {
        const article = list.articles.find((candidate) => candidate.cable && cableKey(candidate.cable) === cableKey(cable.cable))
        if (!article) {
            problems.push({kind: 'noCable', cable: cable.cable})
            continue
        }
        if (cable.unknown) problems.push({kind: 'cableLength', cable: cable.cable, circuits: cable.unknown})
        if (cable.length > 0) add(article.id, Math.ceil(cable.length), 'cable')
    }
    // the lines, with the margin on the purchase price
    const margin = amountOf(options.margin) ?? list.margin ?? 0
    const groupOrder = (article) => ARTICLE_GROUPS.indexOf(article.group) === -1 ? ARTICLE_GROUPS.length : ARTICLE_GROUPS.indexOf(article.group)
    const lines = [...quantities.entries()]
        .map(([id, qty]) => {
            const article = articles.get(id),
                cost = amountOf(article.price)
            if (cost == null) problems.push({kind: 'noPrice', article: id, name: article.name})
            const price = cost == null ? 0 : roundCents(cost * (1 + margin / 100))
            return {
                article: id,
                group: article.group || 'other',
                name: article.name,
                code: article.code || '',
                unit: article.unit || 'st',
                qty: Math.round(qty * 100) / 100,
                cost: cost ?? 0,
                price,
                total: roundCents(price * qty),
                minutes: (amountOf(article.minutes) ?? 0) * qty,
            }
        })
        .sort((a, b) => groupOrder(articles.get(a.article)) - groupOrder(articles.get(b.article)) || a.name.localeCompare(b.name))
    const material = roundCents(lines.reduce((sum, line) => sum + line.total, 0))
    // labour
    const minutes = lines.reduce((sum, line) => sum + line.minutes, 0),
        rate = amountOf(list.labour?.hourly),
        hours = Math.ceil(minutes / 15) / 4
    if (options.labour !== false && minutes > 0 && rate == null) problems.push({kind: 'noHourly'})
    const labour = options.labour === false ? {minutes: 0, hours: 0, rate: rate ?? 0, total: 0} : {minutes, hours, rate: rate ?? 0, total: roundCents(hours * (rate ?? 0))}
    // extra lines
    const extras = (options.extras || [])
        .filter((extra) => extra && String(extra.text || '').trim())
        .map((extra) => {
            const qty = amountOf(extra.qty) ?? 1,
                price = amountOf(extra.price) ?? 0
            return {text: String(extra.text).trim(), qty, price, total: roundCents(qty * price)}
        })
    const subtotal = roundCents(material + labour.total + extras.reduce((sum, extra) => sum + extra.total, 0))
    const vatRate = [21, 6, 0].includes(Number(options.vat)) ? Number(options.vat) : list.vat ?? 21,
        vatAmount = roundCents((subtotal * vatRate) / 100)
    return {lines, labour, extras, material, subtotal, vat: {rate: vatRate, amount: vatAmount}, total: roundCents(subtotal + vatAmount), margin, problems}
}
