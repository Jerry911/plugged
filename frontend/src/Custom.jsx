// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {useState} from 'react'
import {Sym} from './symbols'
import {uid} from './util'
export default function Custom({p,setP}){
 const [shapes,setShapes]=useState([]),[tool,setTool]=useState('line'),[a,setA]=useState(null),[name,setName]=useState(''),[edit,setEdit]=useState(null)
 const click=e=>{const s=e.currentTarget,m=s.createSVGPoint();m.x=e.clientX;m.y=e.clientY;const q=m.matrixTransform(s.getScreenCTM().inverse()),x=Math.round(q.x),y=Math.round(q.y)
  if(tool==='text'){const t=prompt('Tekst');if(t)setShapes([...shapes,{t:'text',x,y,s:t}]);return}
  if(!a)return setA({x,y}); const h=tool==='line'?{t:'line',x1:a.x,y1:a.y,x2:x,y2:y}:tool==='circle'?{t:'circle',cx:a.x,cy:a.y,r:Math.max(1,Math.round(Math.hypot(x-a.x,y-a.y)))}
   :{t:'rect',x:Math.min(a.x,x),y:Math.min(a.y,y),w:Math.abs(x-a.x)||1,h:Math.abs(y-a.y)||1}
  setShapes([...shapes,h]);setA(null)}
 const save=()=>{if(!name||!shapes.length)return alert('Geef een naam en teken minstens één vorm.')
  const c={id:edit||uid(),name,shapes};setP({...p,custom:edit?p.custom.map(x=>x.id===edit?c:x):[...p.custom,c]});reset()}
 const reset=()=>{setShapes([]);setName('');setEdit(null);setA(null)}
 return <div className="row"><div className="main">
  <div className="tb">{['line','circle','rect','text'].map(t=><button key={t} className={tool===t?'on':''} onClick={()=>{setTool(t);setA(null)}}>{{line:'Lijn',circle:'Cirkel (midden, rand)',rect:'Rechthoek',text:'Tekst'}[t]}</button>)}
  <button onClick={()=>setShapes(shapes.slice(0,-1))}>↶</button><button onClick={reset}>Nieuw</button></div>
  <svg viewBox="0 0 24 24" style={{width:'100%',maxWidth:480,border:'1px solid #888',background:'#fff',margin:'8px 0'}} onClick={click}>
  {Array.from({length:23},(_,i)=>Array.from({length:23},(_,j)=><circle key={i+'-'+j} cx={i+1} cy={j+1} r=".07" fill="#999"/>))}
  <Sym shapes={shapes} x={12} y={12} s={24}/>{a&&<circle cx={a.x} cy={a.y} r=".4" fill="red"/>}</svg>
  <input placeholder="Naam component" value={name} onChange={e=>setName(e.target.value)}/> <button onClick={save}>{edit?'Opslaan':'Toevoegen'}</button>
  <p>Eigen componenten verschijnen in het palet van het eendraadschema (onder een kring) en op het situatieschema.</p></div>
  <div className="side"><b>Eigen componenten</b>{p.custom.map(c=><div key={c.id} style={{display:'flex',gap:6,alignItems:'center'}}>
   <svg width="28" height="28" viewBox="0 0 28 28"><Sym shapes={c.shapes} x={14} y={14} s={26}/></svg>{c.name}
   <button onClick={()=>{setShapes(c.shapes);setName(c.name);setEdit(c.id)}}>✎</button>
   <button onClick={()=>setP({...p,custom:p.custom.filter(x=>x.id!==c.id)})}>✕</button></div>)}</div></div>}
