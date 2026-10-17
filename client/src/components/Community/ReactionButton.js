import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
export const REACTIONS = [{id:'heart',icon:'❤️',label:'Coração'},{id:'like',icon:'👍',label:'Joia'},{id:'laugh',icon:'😂',label:'Risada'},{id:'sad',icon:'😢',label:'Triste'}];
export default function ReactionButton({post,busy,onReact}) {
  const [open,setOpen]=useState(false); const current=REACTIONS.find(r=>r.id===post.reaction);
  function choose(reaction){setOpen(false);onReact({action:'like',postId:post.id,liked:post.reaction!==reaction,reaction});}
  return <div className="ph-reaction" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}><button disabled={busy} aria-pressed={Boolean(post.liked)} title={REACTIONS.filter(r=>post.reactions?.[r.id]).map(r=>`${r.label}: ${post.reactions[r.id]}`).join(' · ')} onClick={()=>choose(current?.id||'heart')}><span aria-hidden="true">{current?.icon||'♡'}</span>{post.likes} {current?.label||'Curtir'}</button><button disabled={busy} aria-label="Escolher reação" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><ChevronDown size={12}/></button>{open&&<div className="ph-reaction-picker" role="group" aria-label="Reações">{REACTIONS.map(r=><button key={r.id} disabled={busy} aria-label={r.label} aria-pressed={post.reaction===r.id} onClick={()=>choose(r.id)}><span aria-hidden="true">{r.icon}</span><small>{r.label}</small></button>)}</div>}</div>;
}
