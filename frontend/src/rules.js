// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
// Simplified verification of an eendraadschema against common AREI/RGIE requirements.
// Guideline checks only (limits live in LIMITS so they are easy to adjust); NOT a substitute for an inspection by an accredited body.
import {typeOf} from './symbols'
import {flat,allNodes} from './util'
export const LIMITS={maxStop:8,maxLicht:8,maxDiffmA:30,cable:{1.5:16,2.5:20,4:25,6:32,10:50,16:63}} // cable: mm² -> max protective rating (A)
const S=a=>new Set(a)
const STOP=S(['stopcontact','stopcontact2','stopcontact3']),LIGHT=S(['lichtpunt','wandlamp','tl','noodlicht']),SWITCH=S(['schakelaar','wissel','dimmer'])
const CONTROL=S(['schakelaar','wissel','dimmer','drukknop','aftakdoos'])
const DEDICATED=S(['kookplaat','oven','wasmachine','vaatwas','boiler','airco','laadpaal'])
const REQUIRED={titel:'titel',gemeente:'gemeente',eigenaar:'eigenaar',tekenaar:'getekend door',datum:'datum'}
const ORDER={error:0,warn:1,info:2}
export const parseSpecs=(info='')=>{const r=/(?:\b[BCDK]\s*(\d{1,3})\b)|(?:\b(\d{1,3})\s*A\b)/i.exec(info),s=/(\d+(?:[.,]\d+)?)\s*mm/i.exec(info),m=/(\d+)\s*mA/i.exec(info)
 return{amp:r?+(r[1]||r[2]):null,mm2:s?parseFloat(s[1].replace(',','.')):null,mA:m?+m[1]:null}}
export const summarize=is=>({error:is.filter(i=>i.level==='error').length,warn:is.filter(i=>i.level==='warn').length,info:is.filter(i=>i.level==='info').length})
export function verify(p){
 const out=[],add=(level,rule,msg,pg,n)=>out.push({id:rule+':'+(n?n.id:'g'+out.length),level,rule,msg,nodeId:n?.id,page:pg?p.een.indexOf(pg):null,pageName:pg?.name})
 const finish=()=>out.map((o,i)=>[o,i]).sort((a,b)=>ORDER[a[0].level]-ORDER[b[0].level]||a[1]-b[1]).map(x=>x[0])
 const all=p.een.flatMap(g=>flat(g.tree))
 if(!all.length){add('error','tree.empty','Het eendraadschema is leeg.');return finish()}
 if(!all.some(n=>n.type==='aansluiting'))add('error','tree.noConnection','Er is geen aansluiting op het net (aansluiting) in het schema.')
 if(!all.some(n=>n.type==='aarding'))add('error','earth','Geen aarding (aardingspunt/aardingslus) in het schema.')
 if(!all.some(n=>n.type==='overspanning'))add('info','spd','Geen overspanningsbeveiliging voorzien: ga na of die vereist of aangewezen is.')
 const names={};all.filter(n=>n.type==='kring').forEach(n=>{const k=(n.label||'').trim().toLowerCase();names[k]=(names[k]||0)+1})
 const walk=(pg,ns,parent)=>ns.forEach(n=>{const t=typeOf(p,n.type),kids=flat(n.children),L=n.label||t.name
  if(parent?!t.parents.includes(parent.type):t.parents.length)add('error','hierarchy',parent?`'${L}' (${t.name}) mag niet onder '${parent.label}' (${typeOf(p,parent.type).name}) hangen.`:`'${L}' (${t.name}) kan niet los staan: het moet onder ${t.parents.map(k=>typeOf(p,k).name).join(' of ')} hangen.`,pg,n)
  if(n.type==='aansluiting'&&!n.children.length)add('error','connection.empty',`Aansluiting '${L}' is niet verbonden met een teller of bord.`,pg,n)
  if(n.type==='bord'&&!n.children.some(c=>['kring','diff','zekering','bord'].includes(c.type)))add('warn','bord.empty',`Verdeelbord '${L}' heeft geen kringen of differentiëlen.`,pg,n)
  if(n.type==='diff'){const {mA}=parseSpecs(n.info)
   if(!n.children.length)add('warn','diff.empty',`Differentieel '${L}' beveiligt geen enkele kring.`,pg,n)
   if(mA==null)add('warn','diff.sens',`Differentieel '${L}': gevoeligheid (bv. 30mA) niet opgegeven.`,pg,n)
   else if(mA>LIMITS.maxDiffmA&&kids.some(k=>STOP.has(k.type)))add('error','diff.stop',`Differentieel '${L}' (${mA} mA) beveiligt stopcontacten: maximaal ${LIMITS.maxDiffmA} mA vereist.`,pg,n)}
  if(n.type==='kring'){const {amp,mm2}=parseSpecs(n.info),cons=kids.filter(k=>!CONTROL.has(k.type)),stops=kids.reduce((a,k)=>a+(k.type==='stopcontact2'?2:STOP.has(k.type)?1:0),0),lamps=kids.filter(k=>LIGHT.has(k.type)).length,ded=cons.filter(k=>DEDICATED.has(k.type))
   if(parent?.type==='bord')add('error','kring.noDiff',`Kring '${L}' hangt niet onder een differentieel (aardlekbeveiliging).`,pg,n)
   if(!kids.length)add('warn','kring.empty',`Kring '${L}' bevat geen elementen.`,pg,n)
   if(amp==null||mm2==null)add('warn','kring.specs',`Kring '${L}': beveiliging en/of kabeldoorsnede ontbreekt (bv. "B16 2,5mm²").`,pg,n)
   else if(LIMITS.cable[mm2]&&amp>LIMITS.cable[mm2])add('warn','kring.cable',`Kring '${L}': beveiliging ${amp}A is te hoog voor ${mm2} mm² (max. ${LIMITS.cable[mm2]}A).`,pg,n)
   if(stops>LIMITS.maxStop)add('warn','kring.stop',`Kring '${L}' heeft ${stops} stopcontacten (richtwaarde max. ${LIMITS.maxStop}).`,pg,n)
   if(lamps>LIMITS.maxLicht)add('warn','kring.light',`Kring '${L}' heeft ${lamps} lichtpunten (richtwaarde max. ${LIMITS.maxLicht}).`,pg,n)
   if(ded.length&&cons.length>1)add('warn','kring.dedicated',`Kring '${L}': '${ded[0].label}' hoort op een eigen kring.`,pg,n)
   if(names[(n.label||'').trim().toLowerCase()]>1)add('warn','kring.duplicate',`Meerdere kringen heten '${L}'.`,pg,n)}
  if(SWITCH.has(n.type)&&!kids.some(k=>LIGHT.has(k.type)))add('warn','switch.empty',`Schakelaar '${L}' bedient geen lichtpunt.`,pg,n)
  walk(pg,n.children,n)})
 p.een.forEach(g=>walk(g,g.tree,null))
 const miss=Object.keys(REQUIRED).filter(k=>!(p.footer?.[k]||'').trim())
 if(miss.length)add('warn','footer',`Kaderinfo onvolledig: ${miss.map(k=>REQUIRED[k]).join(', ')}.`)
 const placed=new Set(p.sit.flatMap(g=>g.items).filter(i=>i.kind==='sym').map(i=>i.node))
 allNodes(p).filter(n=>!placed.has(n.id)).forEach(n=>{const pg=p.een.find(g=>flat(g.tree).includes(n));add('warn','plan.unplaced',`'${n.label}' staat niet op het situatieschema.`,pg,n)})
 return finish()}
