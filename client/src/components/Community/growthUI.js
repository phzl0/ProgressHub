import {useRef,useState} from 'react';
import {socialRequest,requestId} from './socialAPI';
export const roleLabels={frontend:'Frontend',backend:'Backend',design:'Design',documentation:'Documentação',testing:'Testes',fullstack:'Full stack'};
export const stateLabels={active:'Em desenvolvimento',paused:'Pausado',completed:'Concluído',archived:'Arquivado',draft:'Rascunho',upcoming:'Em breve',open:'Aberto',ended:'Encerrado',cancelled:'Cancelado',accepting:'Confirmando participação',pending:'Aguardando avaliação',accepted:'Aceita',declined:'Recusada','changes-requested':'Ajustes solicitados',scheduled:'Agendado',processing:'Enviando',sent:'Enviado'};
export const date=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
export const splitTags=value=>value.split(',').map(s=>s.trim()).filter(Boolean);
export function useGrowthAction(path,onSaved){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),pending=useRef(null);
 async function act(body){if(lock.current)return false;lock.current=true;setBusy(true);setError('');const signature=JSON.stringify(body);if(pending.current?.signature!==signature)pending.current={signature,body:{...body,requestId:requestId()}};
 try{const result=await socialRequest(path,pending.current.body,{quiet:false,messages:['Salvando…','Alteração salva.']});pending.current=null;try{await onSaved?.(result,body);}catch(_){setError('Alteração salva. Atualize a aba para recarregar os dados.');}return true;}
 catch(e){setError(e.message);return false;}finally{lock.current=false;setBusy(false);}}
 return {act,busy,error,setError};
}
