import React,{useRef,useState} from 'react';
import CompactDialog from './CompactDialog';
export default function ConfirmDialog({title,children,confirmLabel='Confirmar',onConfirm,onClose}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
 async function confirm(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onConfirm();onClose();}catch(e){setError(e.message||'Não foi possível concluir. Tente novamente.');}finally{lock.current=false;setBusy(false);}}
 return <CompactDialog title={title} closeLabel="Fechar confirmação" onClose={()=>{if(!busy)onClose();}}><div className="ph-report-form">{children}{error&&<p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="ql-button" type="button" disabled={busy} onClick={confirm}>{busy?'Confirmando…':confirmLabel}</button></div></div></CompactDialog>;
}
