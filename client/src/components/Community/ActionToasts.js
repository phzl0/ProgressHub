import React, {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2,AlertCircle,LoaderCircle,X} from 'lucide-react';
import {feedbackSnapshot,subscribeFeedback,dismissFeedback} from './actionFeedback';
function Notice({notice}){
  const [paused,setPaused]=useState(false);
  useEffect(()=>{if(!notice.duration||paused)return;const timer=window.setTimeout(()=>dismissFeedback(notice.id),notice.duration);return()=>window.clearTimeout(timer);},[notice,paused]);
  const Icon=notice.type==='error'?AlertCircle:notice.type==='pending'?LoaderCircle:CheckCircle2;
  return <div className={`ph-action-toast is-${notice.type}`} role={notice.type==='error'?'alert':'status'} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}><Icon size={18} className={notice.type==='pending'?'ql-spin':''}/><div><p>{notice.message}</p>{notice.onReview&&<button onClick={notice.onReview}>Voltar à ação</button>}{notice.onRetry&&<button onClick={async()=>{try{await notice.onRetry();dismissFeedback(notice.id);}catch(_){/* Keep the error visible for another attempt. */}}}>Tentar novamente</button>}</div>{notice.type!=='pending'&&<button aria-label="Fechar aviso" onClick={()=>dismissFeedback(notice.id)}><X size={15}/></button>}</div>;
}
export default function ActionToasts(){const [items,setItems]=useState(feedbackSnapshot);useEffect(()=>subscribeFeedback(()=>setItems(feedbackSnapshot())),[]);return createPortal(<aside className="ph-action-toasts" aria-label="Avisos de ações">{items.map(n=><Notice key={n.id} notice={n}/>)}</aside>,document.body);}
