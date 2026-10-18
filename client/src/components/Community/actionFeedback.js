import { readApiResponse } from './apiResponse';
const listeners=new Set();let notices=[];const requests=new Map();let sequence=0;
export const feedbackSnapshot=()=>notices;
export const subscribeFeedback=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function dismissFeedback(id){notices=notices.filter(n=>n.id!==id);listeners.forEach(fn=>fn());}
export function showFeedback(message,type='success',options={}){
  const notice={id:options.id||`notice-${++sequence}`,message,type,duration:type==='error'||type==='pending'?0:4000,...options};
  notices=[...notices.filter(n=>n.id!==notice.id),notice].slice(-3);listeners.forEach(fn=>fn());return notice.id;
}
const messages={
  'admin:hide':['Ocultando conteúdo…','Conteúdo ocultado.'], 'admin:restore':['Restaurando conteúdo…','Conteúdo restaurado.'], 'admin:warn':['Enviando advertência…','Advertência enviada.'], 'admin:suspend':['Suspendendo participação…','Participação suspensa.'], 'admin:unsuspend':['Reativando participação…','Participação reativada.'], 'admin:report-status':['Atualizando denúncia…','Denúncia atualizada.'], 'admin:announce':['Enviando aviso…','Aviso oficial enviado.'],
  'safety:report':['Enviando denúncia…','Denúncia recebida.'], 'safety:block':['Bloqueando usuário…','Usuário bloqueado.'], 'safety:unblock':['Desbloqueando usuário…','Usuário desbloqueado.'], 'safety:mute-group':['Silenciando grupo…','Notificações do grupo silenciadas.'], 'safety:unmute-group':['Reativando notificações…','Notificações do grupo reativadas.'],
  'social:contact-request':['Enviando convite…','Convite enviado.'], 'social:contact-accept':['Aceitando convite…','Contato adicionado.'], 'social:contact-remove':['Atualizando contato…','Contato atualizado.'],
  'social:group-create':['Criando grupo…','Grupo criado.'], 'social:group-update':['Salvando detalhes…','Detalhes do grupo salvos.'], 'social:group-invite':['Convidando…','Convite para o grupo enviado.'], 'social:group-accept':['Aceitando convite…','Você entrou no grupo.'], 'social:group-leave':['Atualizando grupo…','Participação atualizada.'],
  'feed:publish':['Publicando…','Publicação criada.'], 'feed:comment':['Enviando comentário…','Comentário enviado.'], 'feed:delete-comment':['Excluindo comentário…','Comentário excluído.'], 'feed:delete-post':['Excluindo publicação…','Publicação excluída.'],
  'help:create':['Criando pedido…','Pedido de ajuda criado.'], 'help:join':['Entrando no grupo…','Você entrou para ajudar.'], 'help:save':['Atualizando salvos…','Lista de salvos atualizada.'], 'help:status':['Atualizando pedido…','Estado do pedido atualizado.'], 'help:comment':['Enviando sugestão…','Comentário enviado.'], 'help:delete-comment':['Excluindo comentário…','Comentário excluído.'],
  'inbox:announce':['Enviando aviso…','Aviso enviado à comunidade.'], 'inbox:read':['Atualizando leitura…','Notificações marcadas como lidas.'],
  'profile:':['Salvando perfil…','Perfil atualizado.'], 'cosmetics:':['Equipando…','Aparência equipada.'], 'participation:':['Atualizando participação…','Participação no ranking atualizada.'], 'sync:':['Atualizando contribuições…','Contribuições sincronizadas.'], 'goals:':['Criando meta…','Meta criada.'], 'goals/update:':['Salvando meta…','Meta atualizada.'], 'missions/claim:':['Confirmando recompensa…','Recompensa recebida.'], 'chat/delete:':['Excluindo mensagem…','Mensagem excluída.']
};
export function domainsFor(path){
  const base=path.replace(/^\//,'').split('?')[0];
  if(['profile','cosmetics','participation','sync','missions/claim'].includes(base))return base==='missions/claim'||base==='sync'?['me','leaderboard','missions','achievements']:['me','leaderboard'];
  if(base==='admin')return ['admin','safety','feed','help','chat','social','inbox'];
  if(base==='safety')return ['safety','feed','help','chat','social','inbox'];
  if(base==='social')return ['social','inbox'];if(base==='help')return ['help','social','inbox'];if(base==='feed')return ['feed'];if(base.startsWith('goals'))return ['goals'];if(base==='inbox')return ['inbox'];return [];
}
// A single explicit mutation path: no fetch interception and no automatic replay of writes.
export function mutationRequest(url,options={},metadata={}){
  const base=(metadata.path||url.split('/community/')[1]||'').replace(/^\//,'').split('?')[0];
  let body={};try{body=typeof options.body==='string'?JSON.parse(options.body):{};}catch(_){/* binary payload */}
  const exact=messages[`${base}:${body.action||''}`]||messages[`${base}:`];
  const quiet=metadata.quiet??(!exact);const copy=metadata.messages||exact||['Enviando…','Ação concluída.'];
  const key=metadata.key||`${url}:${typeof options.body==='string'?options.body:++sequence}`;
  if(requests.has(key))return requests.get(key);
  const trigger=typeof document!=='undefined'?document.activeElement:null;const toastId=`action:${base}:${body.action||''}:${body.id||body.postId||body.targetId||body.goalId||body.missionId||body.requestId||''}`;
  if(!quiet)showFeedback(copy[0],'pending',{id:toastId});
  const promise=Promise.resolve().then(async()=>{
    try{
      const data=await readApiResponse(await fetch(url,options));
      if(!quiet)showFeedback(copy[1],'success',{id:toastId});else dismissFeedback(toastId);
      const domains=domainsFor(base);if(domains.length)window.dispatchEvent(new CustomEvent('ph-data-changed',{detail:{domains,path:base,action:body.action||'',id:body.id||body.postId||null,targetId:body.githubId||null,groupId:body.groupId||null}}));
      return data;
    }catch(error){
      showFeedback(error.message||'Não foi possível concluir. Confira os dados e tente novamente.','error',{id:toastId,onReview:trigger?.isConnected?()=>{if(trigger.isConnected){trigger.scrollIntoView?.({block:'center',behavior:'smooth'});trigger.focus();}}:null});throw error;
    }finally{requests.delete(key);}
  });requests.set(key,promise);return promise;
}
