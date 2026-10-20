const CATALOG = {
  frames: [
    { id: 'essential', name: 'Essencial', description: 'Verde vivo. Sua identidade começa aqui.' },
    { id: 'circuit', name: 'Circuito', description: 'Trilhas e conexões inspiradas em placas eletrônicas.' },
    { id: 'terminal', name: 'Terminal', description: 'Cantos marcados, linhas precisas e espírito de código.' },
    { id: 'crystal', name: 'Cristal', description: 'Facetas verdes e violetas para destacar seu perfil.' },
    { id: 'prestige', name: 'Prestígio', description: 'Detalhes dourados em uma assinatura verde.' }
  ],
  covers: [
    { id: 'custom', name: 'Meu banner', description: 'Usar sua imagem enviada ou o fundo padrão.' },
    { id: 'aurora', name: 'Aurora', description: 'Luz esmeralda e profundidade em tons escuros.' },
    { id: 'matrix', name: 'Malha digital', description: 'Uma paisagem de linhas, pontos e conexões.' },
    { id: 'orbit', name: 'Órbita', description: 'Arcos, estrelas e uma nova perspectiva.' }
  ],
  titles: [
    { id: 'none', name: 'Sem título cosmético' },
    { id: 'learning', name: 'Aprendendo em público' },
    { id: 'building', name: 'Ideias em código' },
    { id: 'journey', name: 'Construindo meu caminho' }
  ]
};
CATALOG.frames.push({id:'ember',name:'Brasa',description:'Acabamento cobre e chama suave.'},{id:'forest',name:'Bosque',description:'Folhas e detalhes esmeralda.'},{id:'energy',name:'Energia',description:'Circuito elétrico violeta.',temporary:true});
CATALOG.covers.push({id:'ember',name:'Horizonte de brasa'},{id:'forest',name:'Floresta noturna'},{id:'energy',name:'Campo elétrico',temporary:true});
CATALOG.titles.push({id:'prestige',name:'Forjado no progresso'},{id:'ember',name:'Código em chamas'},{id:'forest',name:'Raízes de código'},{id:'energy',name:'Energia em código',temporary:true});
CATALOG.avatars=[{id:'github',name:'Foto do GitHub'},{id:'bolt',name:'Pulso'},{id:'leaf',name:'Semente'},{id:'compass',name:'Explorador'}];
CATALOG.cards=[{id:'essential',name:'Original'},{id:'prestige',name:'Prestígio'},{id:'ember',name:'Forja'},{id:'forest',name:'Santuário'},{id:'energy',name:'Núcleo elétrico',temporary:true}];
CATALOG.chats=[{id:'standard',name:'Clássico'},{id:'prestige',name:'Assinatura dourada'},{id:'ember',name:'Assinatura de brasa'},{id:'forest',name:'Assinatura do bosque'},{id:'energy',name:'Assinatura elétrica',temporary:true}];
const FIELDS={frames:'frame',covers:'cover',titles:'title',avatars:'avatar',cards:'card',chats:'chat'};
const DEFAULTS={frame:'essential',cover:'custom',title:'none',avatar:'github',card:'essential',chat:'standard'};
const DEFAULT_APPEARANCE={frame:'essential',cover:'custom',title:'none'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function validateAppearance(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Escolha itens válidos do seu baú.');
  const result={};
  for(const [category,field] of Object.entries(FIELDS)){
    const value=input[field]===undefined&&['avatar','card','chat'].includes(field)?DEFAULTS[field]:input[field];
    if(!CATALOG[category].some(item=>item.id===value))throw fail('Escolha itens válidos do seu baú.');
    if(['frame','cover','title'].includes(field)||value!==DEFAULTS[field])result[field]=value;
  }
  return result;
}
function welcomeExpiry(user){
  const claimed=new Date(user?.communityCosmetics?.welcomeClaimedAt||0).getTime();
  const expires=new Date(user?.communityCosmetics?.welcomeExpiresAt||0).getTime();
  return claimed>0&&expires===claimed+7*86400000?expires:0;
}
function inventoryFor(user,now=new Date()){
  const expiry=welcomeExpiry(user);
  const catalog=Object.fromEntries(Object.entries(CATALOG).map(([category,items])=>[category,items.map(item=>({...item,owned:!item.temporary||expiry>now.getTime(),permanent:!item.temporary,expiresAt:item.temporary&&expiry?new Date(expiry).toISOString():null}))]));
  return {catalog,appearance:appearanceFor(user,now),welcomeClaimed:Boolean(user?.communityCosmetics?.welcomeClaimedAt),serverTime:now.toISOString()};
}
async function claimWelcome(db,user,now=new Date()){
  await db.collection('users').updateOne({_id:user._id,'communityCosmetics.welcomeClaimedAt':{$exists:false}},{$set:{communityCosmetics:{welcomeClaimedAt:now,welcomeExpiresAt:new Date(now.getTime()+7*86400000)}}});
  return inventoryFor(await db.collection('users').findOne({_id:user._id}),now);
}
function validateOwnedAppearance(input,user,now=new Date()){
  const result=validateAppearance(input);const expiresAt={};
  for(const [category,field] of Object.entries(FIELDS)){
    const item=CATALOG[category].find(i=>i.id===(result[field]||DEFAULTS[field]));
    if(item.temporary){const expiry=welcomeExpiry(user);if(expiry<=now.getTime())throw fail('Este item não está disponível ou já expirou. Abra o Meu baú.',403);expiresAt[field]=new Date(expiry).toISOString();}
  }
  return {...result,...(Object.keys(expiresAt).length?{expiresAt}:{})};
}
function appearanceFor(user,now=new Date()){
  const source=user?.communityAppearance||DEFAULT_APPEARANCE;
  let result;try{result=validateAppearance(source);}catch(_){return {...DEFAULT_APPEARANCE};}
  const expiresAt={};
  for(const [category,field] of Object.entries(FIELDS)){
    const item=CATALOG[category].find(i=>i.id===(result[field]||DEFAULTS[field]));
    if(item.temporary){const end=new Date(source.expiresAt?.[field]||0).getTime();
      if(!Number.isFinite(end)||end<=now.getTime()){if(['frame','cover','title'].includes(field))result[field]=DEFAULTS[field];else delete result[field];}
      else expiresAt[field]=new Date(end).toISOString();
    }
  }
  return {...result,...(Object.keys(expiresAt).length?{expiresAt}:{})};
}
module.exports={CATALOG,DEFAULT_APPEARANCE,FIELDS,validateAppearance,validateOwnedAppearance,appearanceFor,inventoryFor,claimWelcome};
