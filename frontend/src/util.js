// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {typeOf} from './symbols'

export const uid = () => Math.random().toString(36).slice(2, 9)
export const flat = ns => ns.flatMap(n => [n, ...flat(n.children)])
export const reid = ns => ns.map(n => ({...n, id: uid(), children: reid(n.children)}))
export const allNodes = p => p.een.flatMap(g => flat(g.tree)).filter(n => typeOf(p, n.type).place)
export const unplacedOf = p => {
    const s = new Set(p.sit.flatMap(g => g.items).filter(i => i.kind === 'sym').map(i => i.node));
    return allNodes(p).filter(n => !s.has(n.id))
}
