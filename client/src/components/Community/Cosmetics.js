import React, { useState } from 'react';
import { Check, Save, RotateCcw, Lock, Sparkles } from 'lucide-react';
import useCommunityData, { COMMUNITY_API } from './useCommunityData';
import { mutationRequest } from './actionFeedback';
import { CosmeticAvatar, CosmeticTitle, ProfileCard, CosmeticChatFrame, coverProps, cosmeticStyle, DEFAULT_APPEARANCE, useAppearance } from './Appearance';
const categories=[['frames','Molduras','frame'],['avatars','Avatares','avatar'],['titles','Títulos','title'],['cards','Cards de perfil','card'],['chats','Chat','chat'],['covers','Capas','cover']];
const defaults={...DEFAULT_APPEARANCE,avatar:'github',card:'essential',chat:'standard'};
function ItemPreview({tab,item,picture,banner}) {
  if(tab==='frames'||tab==='avatars')return <CosmeticAvatar src={picture} frame={tab==='frames'?item.id:'essential'} appearance={tab==='avatars'?{avatar:item.id}:item.id==='energy'?{frame:item.id,expiresAt:{frame:item.expiresAt},permanentEffects:item.permanent?['frame']:[]}:undefined} size={58}/>;
  if(item.asset)return <span aria-hidden="true" className={`ph-library-swatch${tab==='chats'?' is-chat':''}`} style={cosmeticStyle(tab,item.id)}><span>PH</span></span>;
  if(tab==='covers')return <span className={`ql-cosmetic-cover-swatch ql-cover-${item.id}`} style={item.id==='custom'?coverProps({cover:'custom'},banner).style:undefined}/>;
  return <span aria-hidden="true" className={`ph-item-swatch ph-skin-${item.id}`}>{tab==='titles'?'Aa':'◇'}</span>;
}
export default function Cosmetics({me,onEquipped}) {
  const {data,setData,error}=useCommunityData('/cosmetics',me?.connected);
  const [choice,setChoice]=useState(me?.appearance||DEFAULT_APPEARANCE);
  const active=useAppearance(choice);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState('');
  const [tab,setTab]=useState('frames'),[collection,setCollection]=useState('all'),[query,setQuery]=useState('');
  const equipped=me?.appearance||DEFAULT_APPEARANCE;
  const changed=Object.keys(defaults).some(key=>(choice[key]||defaults[key])!==(equipped[key]||defaults[key]));
  const field=categories.find(row=>row[0]===tab)[2];
  const unavailable=categories.some(([category,,key])=>{
    const item=data?.catalog?.[category]?.find(item=>item.id===(choice[key]||defaults[key]));
    return item&&(item.owned===false||(item.expiresAt&&Date.parse(item.expiresAt)<=Date.now()));
  });
  const cover=coverProps(active,me?.profile?.banner);
  const items=data?.catalog?.[tab]||[];
  const collectionNames=[...new Set(items.map(item=>item.collection||'Coleção inicial'))];
  const visible=items.filter(item=>(collection==='all'||(item.collection||'Coleção inicial')===collection)&&item.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR').trim()));
  async function request(path,body) {
    setBusy(true);setMessage('');setSaveError('');
    try{return await mutationRequest(`${COMMUNITY_API}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch(err){setSaveError(err.message);return null;}
    finally{setBusy(false);}
  }
  async function equip() {
    const result=await request('/cosmetics',choice);
    if(result){onEquipped?.(result.appearance);setChoice(result.appearance);setMessage('Aparência equipada. Sua identidade foi atualizada.');}
  }
  async function claim() {
    const result=await request('/cosmetics/welcome',{});
    if(result){setData(result);setMessage('Coleção Energia recebida! Confira o vencimento indicado nos itens.');}
  }
  function select(item) {
    setChoice(current=>{
      const permanentEffects=(current.permanentEffects||[]).filter(key=>key!==field);
      if(item.temporary&&item.permanent)permanentEffects.push(field);
      const next={...current,[field]:item.id};
      if(item.expiresAt||current.expiresAt)next.expiresAt={...current.expiresAt,[field]:item.expiresAt};
      if(permanentEffects.length)next.permanentEffects=permanentEffects;else delete next.permanentEffects;
      return next;
    });setMessage('');setSaveError('');
  }
  return <section className="ql-cosmetics ph-inventory ql-game">
    <p className="ql-caption">Sua identidade na comunidade. Experimente antes de equipar. Cosméticos não alteram XP ou classificação.</p>
    {data?.fullCollection&&<p className="ph-collection-access"><Check size={14}/> Todos os cosméticos disponíveis na sua conta.</p>}
    {data&&!data.welcomeClaimed&&<div className="ph-welcome-collection"><Sparkles size={20}/><div><strong>Coleção Energia · 7 dias</strong><p>O prazo começa ao receber e não é renovado ao equipar.</p></div><button className="ql-button" disabled={busy} onClick={claim}>Receber coleção</button></div>}
    <div className="ql-cosmetics-layout">
      <div className="ph-inventory-preview"><ProfileCard appearance={choice} className="ql-cosmetic-preview"><div className={`ql-cosmetic-preview-cover ${cover.className}`} style={cover.style}><span className="ql-preview-label">PRÉVIA</span></div><div className="ql-cosmetic-preview-body"><CosmeticAvatar src={me?.picture} alt="Prévia da sua moldura" appearance={choice} size={100}/><strong>{me?.name||me?.login}</strong><span className="ql-caption">@{me?.login}</span><CosmeticTitle appearance={choice}/><span className="ql-caption">{me?.career?.title||'Explorador'} · Nível {me?.career?.level||1}</span></div></ProfileCard><CosmeticChatFrame as="div" appearance={choice} className="ph-inventory-chat"><div className="ql-chat-message-body"><strong>@{me?.login}</strong><p>Mais uma ideia ganhando vida.</p></div></CosmeticChatFrame><p className="ql-caption">Prévia do perfil e da assinatura no chat.</p></div>
      <div className="ql-cosmetic-options">
        <div className="ql-cosmetic-tabs" role="group" aria-label="Categoria de cosméticos">{categories.map(([id,label])=><button type="button" key={id} disabled={busy} aria-pressed={tab===id} onClick={()=>{setTab(id);setCollection('all');setQuery('');}}>{label}</button>)}</div>
        {!!items.length&&<div className="ph-inventory-filters"><label>Coleção<select aria-label="Filtrar coleção" value={collection} onChange={event=>setCollection(event.target.value)}><option value="all">Todas as coleções</option>{collectionNames.map(name=><option key={name}>{name}</option>)}</select></label><label>Buscar<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nome do cosmético"/></label><span>{visible.length} itens · {items.filter(item=>item.owned!==false).length} disponíveis</span></div>}
        {!data&&!error&&<p role="status">Carregando coleção…</p>}
        <div className="ql-cosmetic-items">{visible.map(item=><button type="button" key={item.id} className="ql-cosmetic-item" aria-label={item.name} aria-pressed={(choice[field]||defaults[field])===item.id} disabled={busy} onClick={()=>select(item)}>
          <ItemPreview tab={tab} item={item} picture={me?.picture} banner={me?.profile?.banner}/>
          <span><strong>{item.name}</strong><small>{item.collection||'Coleção inicial'}</small>{item.description&&<small>{item.description}</small>}<small>{item.permanent||!item.temporary?'Permanente':item.expiresAt?`Até ${new Date(item.expiresAt).toLocaleString('pt-BR')}`:'Temporário · receba a coleção'}</small>{item.owned===false&&<small><Lock size={11}/> {item.expiresAt?'Expirado':'Ainda não desbloqueado'}</small>}</span>
          {(choice[field]||defaults[field])===item.id&&<Check size={16}/>}
        </button>)}</div>
        {data&&!visible.length&&<p className="ql-caption">Nenhum cosmético encontrado com esse filtro.</p>}
      </div>
    </div>
    {(error||saveError)&&<p role="alert" className="ql-error">{saveError||error}</p>}{message&&<p role="status" className="ql-profile-saved">{message}</p>}
    <div className="ql-cosmetic-footer"><button className="ql-refresh" disabled={busy||!changed} onClick={()=>{setChoice(equipped);setMessage('');}}><RotateCcw size={15}/>Desfazer prévia</button><button className="ql-button" disabled={busy||!changed||!data||unavailable} onClick={equip}><Save size={16}/>{busy?'Salvando…':unavailable?'Item indisponível':changed?'Equipar aparência':'Aparência equipada'}</button></div>
  </section>;
}
