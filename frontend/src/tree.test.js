// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {upd,find,mv,indent,outdent,layout,leaves,depth} from './Eendraad'
import {node} from './test/utils'
const mk=()=>[node('A','bord',[node('B','kring'),node('C','kring')]),node('D','bord')]
const ids=ns=>ns.map(n=>[n.id,ids(n.children)])
test('find',()=>{expect(find(mk(),'C').id).toBe('C');expect(find(mk(),'zz')).toBeUndefined()})
test('upd replaces, removes and recurses',()=>{expect(upd(mk(),'D',n=>[{...n,label:'x'}])[1].label).toBe('x');expect(ids(upd(mk(),'B',()=>[]))[0][1]).toEqual([['C',[]]]);expect(ids(upd(mk(),'zz',()=>[]))).toEqual(ids(mk()))})
test('mv top-level, nested and out of bounds',()=>{expect(mv(mk(),'A',1).map(n=>n.id)).toEqual(['D','A']);expect(mv(mk(),'C',-1)[0].children.map(n=>n.id)).toEqual(['C','B'])
 expect(mv(mk(),'A',-1).map(n=>n.id)).toEqual(['A','D']);expect(mv(mk(),'D',1).map(n=>n.id)).toEqual(['A','D'])})
test('indent moves under previous sibling',()=>{expect(ids(indent(mk(),'D'))[0][1].map(x=>x[0])).toEqual(['B','C','D']);expect(ids(indent(mk(),'A'))).toEqual(ids(mk()))
 expect(ids(indent(mk(),'C'))[0][1][0]).toEqual(['B',[['C',[]]]])})
test('outdent lifts after parent',()=>{expect(outdent(mk(),'B').map(n=>n.id)).toEqual(['A','B','D']);expect(outdent(mk(),'A').map(n=>n.id)).toEqual(['A','D'])})
test('layout, leaves, depth',()=>{const l=layout(mk());expect(l[0].x).toBe(0.5);expect(l[1].x).toBe(2);expect(leaves(mk())).toBe(3);expect(depth(mk())).toBe(2);expect(depth([])).toBe(0)})
