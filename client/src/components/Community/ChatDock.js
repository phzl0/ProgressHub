import React,{createContext,useCallback,useContext,useEffect,useRef,useState,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {MessagesSquare,Maximize2,Minimize2,X} from 'lucide-react';
import CommunityChat from './CommunityChat';
const Context=createContext(null);
export const useChatDock=()=>useContext(Context);
export function ChatDockProvider({connected,ready=true,children}){
 const direct=window.location.hash.split('?')[0]==='#community/general';const [open,setOpen]=useState(direct);const [started,setStarted]=useState(direct);const [wide,setWide]=useState(false);const [draft,setDraft]=useState('');const panel=useRef(null);const closeButton=useRef(null);const trigger=useRef(null);
 const show=useCallback(()=>{trigger.current=document.activeElement;setStarted(true);setOpen(true);},[]);
 const close=useCallback(()=>{setOpen(false);const target=trigger.current;window.requestAnimationFrame(()=>{if(target?.isConnected&&!panel.current?.contains(target))target.focus();else document.querySelector('.ph-chat-launcher')?.focus();});},[]);
 useEffect(()=>{if(open)closeButton.current?.focus();},[open]);
 useEffect(()=>{if(!ready)return;const legacy=()=>{if(window.location.hash.split('?')[0]!=='#community/general')return;show();window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#community`);};legacy();window.addEventListener('hashchange',legacy);return()=>window.removeEventListener('hashchange',legacy);},[show,ready]);
 useEffect(()=>{if(!open)return;const escape=e=>{if(e.key==='Escape'&&!e.defaultPrevented&&panel.current?.contains(document.activeElement)){e.preventDefault();close();}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[open,close]);
 const context=useMemo(()=>({open:show,isOpen:open}),[show,open]);
 return <Context.Provider value={context}>{children}{ready&&createPortal(<>{connected&&!open&&<button className="ph-chat-launcher" aria-label="Abrir chat geral" title="Chat geral" onClick={show}><MessagesSquare size={20}/><span>Chat geral</span></button>}{started&&<aside className={`ph-chat-dock ql-game${wide?' is-wide':''}`} hidden={!open} ref={panel} aria-label="Chat geral lateral"><header className="ph-chat-dock-header"><div><MessagesSquare size={18}/><span>Chat geral<small>COMUNIDADE · PROGRESS HUB</small></span></div><nav aria-label="Controles do chat geral"><button aria-label={wide?'Reduzir chat geral':'Ampliar chat geral'} aria-pressed={wide} onClick={()=>setWide(v=>!v)}>{wide?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button ref={closeButton} aria-label="Fechar chat geral" onClick={close}><X size={18}/></button></nav></header><CommunityChat connected={connected} active={open} title="Chat geral" draftValue={draft} onDraftChange={setDraft} showRecent/></aside>}</>,document.body)}</Context.Provider>;
}
