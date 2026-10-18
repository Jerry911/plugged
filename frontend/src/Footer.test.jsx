// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {render,fireEvent} from '@testing-library/react'
import {FooterForm,Sheet,FIELDS} from './Footer'
import {base} from './test/utils'
test('FooterForm renders all fields and reports changes',()=>{const setP=vi.fn(),p=base();const {container}=render(<FooterForm p={p} setP={setP}/>)
 const ins=container.querySelectorAll('input');expect(ins).toHaveLength(FIELDS.length);fireEvent.change(ins[1],{target:{value:'Kerkstraat'}})
 expect(setP).toHaveBeenCalledWith({...p,footer:{...p.footer,straat:'Kerkstraat'}})})
test('Sheet draws footer info, page numbers and forwards props',()=>{const p=base();p.footer={...p.footer,straat:'Dorp',nr:'5',postcode:'9000',gemeente:'Gent',eigenaar:'Jan',ean:'541',tekenaar:'Piet',stelsel:'230V TT',dossier:'D1',keurder:'Vinçotte'}
 const onClick=vi.fn();const {container,getByText}=render(<Sheet p={p} page={3} total={5} name="Test" onClick={onClick}><circle/></Sheet>)
 getByText('Blad 3/5');getByText(/Dorp 5, 9000 Gent/);getByText(/Jan 541/);getByText(/230V TT - dossier D1 - Vinçotte/);getByText('Piet');fireEvent.click(container.querySelector('svg'));expect(onClick).toHaveBeenCalled()})
test('Sheet copes with empty footer',()=>{const {getByText}=render(<Sheet p={{footer:{}}} page={1} name="N"/>);getByText('Blad 1/2')})
