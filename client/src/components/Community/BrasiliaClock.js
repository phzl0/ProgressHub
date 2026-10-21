import React,{useEffect,useState} from 'react';
export const BRASILIA='America/Sao_Paulo';
export default function BrasiliaClock(){
 const [now,setNow]=useState(()=>new Date());useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[]);
 return <div className="ph-brasilia-clock"><span>Horário de Brasília</span><time dateTime={now.toISOString()}>{now.toLocaleDateString('pt-BR',{timeZone:BRASILIA})} · {now.toLocaleTimeString('pt-BR',{timeZone:BRASILIA,hour12:false})}</time></div>;
}
