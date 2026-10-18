import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {socialRequest} from './socialAPI';
const EMPTY={blocked:[],muted:[],reports:[],hasMoreReports:false};
const Context=createContext({connected:false,viewerId:null,data:EMPTY,loading:false,error:'',refresh:async()=>{},isBlocked:()=>false});
export function useSafety(){return useContext(Context);}
export function SafetyProvider({connected,viewerId,children}){
  const [data,setData]=useState(EMPTY);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const epoch=useRef(0);const active=useRef(false);
  const invalidate=useCallback(()=>{epoch.current+=1;},[]);
  const refresh=useCallback(async()=>{if(!connected||!viewerId)return;const version=++epoch.current;setLoading(true);try{const d=await socialRequest('safety');if(active.current&&version===epoch.current){setData({...EMPTY,...d});setError('');}}catch(e){if(active.current&&version===epoch.current)setError(e.message);}finally{if(active.current&&version===epoch.current)setLoading(false);}},[connected,viewerId]);
  useEffect(()=>{active.current=true;setData(EMPTY);setError('');refresh();const changed=e=>{if(!e.detail?.domains?.includes('safety'))return;
    // These changes are applied only after the server confirms the write.
    const {action,targetId,groupId}=e.detail;
    if(action==='block')setData(old=>({...old,blocked:[...old.blocked.filter(r=>r.githubId!==targetId),{githubId:targetId}]}));
    if(action==='unblock')setData(old=>({...old,blocked:old.blocked.filter(r=>r.githubId!==targetId)}));
    if(action==='mute-group')setData(old=>({...old,muted:[...old.muted.filter(r=>r.id!==groupId),{id:groupId}]}));
    if(action==='unmute-group')setData(old=>({...old,muted:old.muted.filter(r=>r.id!==groupId)}));
    refresh();};window.addEventListener('ph-data-changed',changed);return()=>{active.current=false;invalidate();window.removeEventListener('ph-data-changed',changed);};},[refresh,invalidate]);
  const isBlocked=id=>Boolean(id&&data.blocked.some(r=>r.githubId===id));
  return <Context.Provider value={{connected:Boolean(connected),viewerId,data,loading,error,refresh,isBlocked}}>{children}</Context.Provider>;
}
