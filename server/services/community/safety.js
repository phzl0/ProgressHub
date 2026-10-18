const {ObjectId}=require('mongodb');
const {boundedText}=require('./text-limits');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const REASONS=['spam','harassment','inappropriate','manipulation','other'];
const TYPES=['user','post','comment','help-comment','message','help'];
const hex=value=>typeof value==='string'&&/^[a-f0-9]{24}$/.test(value);
const account=value=>typeof value==='string'&&/^\d{1,20}$/.test(value);
async function blockedIds(db,user){if(!user?.githubId)return [];return (await db.collection('communityBlocks').find({githubId:user.githubId},{projection:{blockedId:1}}).toArray()).map(r=>r.blockedId);}
async function requireVisible(db,user,author){if(author&&author!==user?.githubId&&await db.collection('communityBlocks').findOne({_id:`${user.githubId}:${author}`}))throw fail('Conteúdo indisponível.',404);}
async function requireUnblockedPair(db,a,b){if(await db.collection('communityBlocks').findOne({$or:[{githubId:a,blockedId:b},{githubId:b,blockedId:a}]}))throw fail('Não é possível enviar ou aceitar este convite.',403);}
async function resolveReport(db,user,type,targetId){
  if(!TYPES.includes(type)||typeof targetId!=='string'||!targetId||targetId.length>200)throw fail('Conteúdo inválido.');
  if(type==='user'){
    if(!account(targetId))throw fail('Usuário indisponível.',404);
    const person=await db.collection('users').findOne({githubId:targetId},{projection:{githubId:1,githubLogin:1}});if(!person)throw fail('Usuário indisponível.',404);
    return {authorId:person.githubId,label:`Usuário @${person.githubLogin}`,excerpt:'',contextId:null};
  }
  let row,parentId=null;
  if(type==='post'||type==='help'||type==='message'){
    if(!hex(targetId))throw fail('Conteúdo indisponível.',404);
    row=await db.collection(type==='post'?'communityPosts':type==='help'?'communityGroups':'communityMessages').findOne({_id:new ObjectId(targetId),deletedAt:{$exists:false},...(type==='help'?{type:'help'}:{})});
  }else{
    row=await db.collection(type==='comment'?'communityComments':'communityHelpComments').findOne({_id:targetId,deletedAt:{$exists:false}});
    if(row){parentId=type==='comment'?row.postId:row.helpId;const parent=hex(parentId)?await db.collection(type==='comment'?'communityPosts':'communityGroups').findOne({_id:new ObjectId(parentId),deletedAt:{$exists:false},...(type==='help-comment'?{type:'help'}:{})}):null;if(!parent)row=null;}
  }
  if(!row)throw fail('Conteúdo indisponível.',404);
  if(type==='message'){await require('./social').channelFor(db,user,row.channel||'general');parentId=row.channel?.startsWith('group:')?row.channel.slice(6):'general';}
  return {authorId:type==='help'?row.owner:row.githubId,label:({post:'Publicação',help:'Pedido de ajuda',message:'Mensagem',comment:'Comentário','help-comment':'Comentário em pedido de ajuda'})[type],excerpt:String(row.text||row.description||'').slice(0,600),contextId:parentId,attachment:row.attachment?{name:row.attachment.name,type:row.attachment.type}:null};
}
async function readSafety(db,user,query={}){
  const reportsFilter={reporterId:user.githubId};if(query.before){if(!hex(query.before))throw fail('Página inválida.');reportsFilter._id={$lt:new ObjectId(query.before)};}
  const [blocks,mutes,reports]=await Promise.all([
    db.collection('communityBlocks').find({githubId:user.githubId}).sort({createdAt:-1}).toArray(),
    db.collection('communityGroupMutes').find({githubId:user.githubId}).sort({createdAt:-1}).toArray(),
    db.collection('communityReports').find(reportsFilter,{projection:{targetType:1,label:1,reason:1,status:1,createdAt:1}}).sort({_id:-1}).limit(21).toArray()
  ]);
  const [people,groups]=await Promise.all([
    db.collection('users').find({githubId:{$in:blocks.map(r=>r.blockedId)}},{projection:{githubId:1,githubLogin:1,picture:1}}).toArray(),
    db.collection('communityGroups').find({_id:{$in:mutes.map(r=>new ObjectId(r.groupId))},members:user.githubId},{projection:{name:1}}).toArray()
  ]);
  return {blocked:blocks.map(r=>{const p=people.find(p=>p.githubId===r.blockedId);return {githubId:r.blockedId,login:p?.githubLogin||r.login||'Participante',picture:p?.picture||'',createdAt:r.createdAt};}),muted:mutes.map(r=>({id:r.groupId,name:groups.find(g=>g._id.toHexString()===r.groupId)?.name||'Grupo indisponível',available:groups.some(g=>g._id.toHexString()===r.groupId),createdAt:r.createdAt})),reports:reports.slice(0,20).map(r=>({id:r._id.toHexString(),type:r.targetType,label:r.label,reason:r.reason,status:r.status,createdAt:r.createdAt})),hasMoreReports:reports.length>20};
}
async function safetyAction(db,user,input){
  if(input.action==='block'||input.action==='unblock'){
    if(!account(input.githubId)||input.githubId===user.githubId)throw fail('Escolha outro participante.');
    const key=`${user.githubId}:${input.githubId}`;
    if(input.action==='block'){
      const target=await db.collection('users').findOne({githubId:input.githubId},{projection:{githubLogin:1}});if(!target)throw fail('Usuário indisponível.',404);
      if(!await db.collection('communityBlocks').findOne({_id:key})&&await db.collection('communityBlocks').countDocuments({githubId:user.githubId})>=500)throw fail('Você já tem 500 usuários bloqueados. Revise a lista nas configurações.');
      await db.collection('communityBlocks').updateOne({_id:key},{$setOnInsert:{githubId:user.githubId,blockedId:input.githubId,login:target.githubLogin,createdAt:new Date()}},{upsert:true});
      await db.collection('communityContacts').deleteMany({status:'pending',$or:[{from:user.githubId,to:input.githubId},{from:input.githubId,to:user.githubId}]});
      await db.collection('communityGroups').updateMany({owner:user.githubId,invited:input.githubId},{$pull:{invited:input.githubId}});
      await db.collection('communityGroups').updateMany({owner:input.githubId,invited:user.githubId},{$pull:{invited:user.githubId}});
    }else await db.collection('communityBlocks').deleteOne({_id:key});
    return {ok:true};
  }
  if(input.action==='mute-group'||input.action==='unmute-group'){
    if(!hex(input.groupId))throw fail('Grupo indisponível.',404);const key=`${user.githubId}:${input.groupId}`;
    if(input.action==='mute-group'){
      if(!await db.collection('communityGroups').findOne({_id:new ObjectId(input.groupId),members:user.githubId}))throw fail('Você não participa deste grupo.',403);
      await db.collection('communityGroupMutes').updateOne({_id:key},{$setOnInsert:{githubId:user.githubId,groupId:input.groupId,createdAt:new Date()}},{upsert:true});
    }else await db.collection('communityGroupMutes').deleteOne({_id:key});return {ok:true};
  }
  if(input.action==='report'){
    if(!REASONS.includes(input.reason))throw fail('Escolha um motivo válido.');
    if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))throw fail('Tentativa inválida.');
    const previous=await db.collection('communityReports').findOne({requestKey:`${user.githubId}:${input.requestId}`,reporterId:user.githubId});if(previous){if(previous.targetType!==input.targetType||previous.targetId!==input.targetId)throw fail('Esta tentativa pertence a outra denúncia.',409);return {id:previous._id.toHexString(),status:previous.status};}
    const note=boundedText(input.note||'',1000,8,true);const target=await resolveReport(db,user,input.targetType,input.targetId);
    if(target.authorId===user.githubId)throw fail('Não é possível denunciar o próprio conteúdo.');
    const requestKey=`${user.githubId}:${input.requestId}`;const reports=db.collection('communityReports');
    let row=await reports.findOne({reporterId:user.githubId,targetType:input.targetType,targetId:input.targetId,status:'received'});
    if(!row){
      row={_id:new ObjectId(),requestKey,reporterId:user.githubId,targetType:input.targetType,targetId:input.targetId,reason:input.reason,note,status:'received',createdAt:new Date(),...target};
      try{await reports.insertOne(row);}catch(e){if(e.code!==11000)throw e;row=await reports.findOne({reporterId:user.githubId,$or:[{requestKey},{targetType:input.targetType,targetId:input.targetId,status:'received'}]});if(!row)throw fail('Tentativa inválida.',409);}
    }
    if(row.targetType!==input.targetType||row.targetId!==input.targetId)throw fail('Esta tentativa pertence a outra denúncia.',409);
    return {id:row._id.toHexString(),status:'received'};
  }
  throw fail('Ação inválida.');
}
module.exports={REASONS,TYPES,blockedIds,requireVisible,requireUnblockedPair,resolveReport,readSafety,safetyAction};
