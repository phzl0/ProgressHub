import React, { useRef, useState } from 'react';
import ReactionButton from './ReactionButton';
import { socialRequest } from './socialAPI';
export default function MessageReactions({kind,item,onUpdated}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
  async function act(body){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await socialRequest('reactions',{kind,targetId:item.id,reaction:body.liked?body.reaction:null});onUpdated(result);}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  return <div className="ph-message-reactions"><ReactionButton post={item} busy={busy} onReact={act}/>{error&&<small role="alert">{error}</small>}</div>;
}
