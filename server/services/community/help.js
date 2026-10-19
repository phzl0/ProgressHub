const { ObjectId } = require('mongodb');
const { boundedText } = require('./text-limits');
const {blockedIds,requireVisible,requireUnblockedPair}=require('./safety');
const { notify } = require('./notifications');
const helpersFor = r => [...new Set([...(r.helpers||[]),...r.members.filter(m=>m!==r.owner)])];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateHelp(input) {
  const title = boundedText(input.title,80,1);
  const description = boundedText(input.description,2000,8);
  const limit = input.limit;
  if (!title || title.length > 80 || !description || description.length > 2000 || !Number.isInteger(limit) || limit < 2 || limit > 20) throw fail('Informe título (80 caracteres), descrição (2.000) e limite de 2 a 20 participantes.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Pedido inválido.');
  if(input.requiresApproval!==undefined&&typeof input.requiresApproval!=='boolean')throw fail('Aprovação inválida.');
  return { title, description, limit, requiresApproval:Boolean(input.requiresApproval), requestId: input.requestId };
}
async function readHelp(db, user, query = {}) {
  const hidden=await blockedIds(db,user);
  const filter = { type: 'help',moderationHidden:{$ne:true},$and:[{owner:{$nin:hidden}}] }; const viewer=user?.githubId;
  if(query.id) { if(typeof query.id!=='string'||!/^[a-f0-9]{24}$/.test(query.id))throw fail('Pedido indisponível.',404);filter._id=new ObjectId(query.id); }
  if(query.profileId) {
    if(typeof query.profileId!=='string'||!/^\d{1,20}$/.test(query.profileId)||!await db.collection('users').findOne({githubId:query.profileId,communityOptIn:true}))throw fail('Perfil indisponível.',404);
    if(query.tab&&query.tab!=='mine')throw fail('Esta coleção é privada.',403);filter.owner=query.profileId;
  } else if(query.tab==='mine')filter.owner=viewer;
  else if(query.tab==='helped'){filter.owner={$ne:viewer};filter.$or=[{helpers:viewer},{members:viewer}];}
  else if(query.tab==='saved'){const saved=await db.collection('communityHelpSaves').find({githubId:viewer},{projection:{helpId:1}}).limit(500).toArray();filter._id={$in:saved.map(s=>new ObjectId(s.helpId))};}
  else if(query.tab&&query.tab!=='all')throw fail('Coleção inválida.');
  if(query.id&&query.before)throw fail('Página inválida.');
  if(query.before){if(typeof query.before!=='string'||!/^[a-f0-9]{24}$/.test(query.before))throw fail('Página inválida.');filter._id={...(filter._id||{}),$lt:new ObjectId(query.before)};}
  const rows=await db.collection('communityGroups').find(filter).sort({_id:-1}).limit(21).toArray();
  const users=await db.collection('users').find({githubId:{$in:[...new Set(rows.flatMap(r=>[r.owner,...helpersFor(r)]))]}},{projection:{githubId:1,githubLogin:1,communityOptIn:1}}).toArray();
  const ids=rows.map(r=>r._id.toHexString());
  const saved=viewer?await db.collection('communityHelpSaves').find({githubId:viewer,helpId:{$in:ids}}).toArray():[];
  const counts=await db.collection('communityHelpComments').aggregate([{$match:{helpId:{$in:ids},githubId:{$nin:hidden},deletedAt:{$exists:false},moderationHidden:{$ne:true}}},{$group:{_id:'$helpId',count:{$sum:1}}}]).toArray();
  return {requests:rows.slice(0,20).map(r=>({id:r._id.toHexString(),title:r.name,description:r.description,status:r.helpStatus,limit:r.helpLimit,count:r.members.length,joined:r.members.includes(viewer),requiresApproval:Boolean(r.requiresApproval),pending:Boolean(viewer&&(r.joinRequests||[]).includes(viewer)),own:r.owner===viewer,authorId:r.owner,author:users.find(u=>u.githubId===r.owner)?.githubLogin||'Participante',createdAt:r.createdAt,saved:saved.some(s=>s.helpId===r._id.toHexString()),commentCount:counts.find(c=>c._id===r._id.toHexString())?.count||0,helpers:helpersFor(r).map(m=>{const u=users.find(u=>u.githubId===m);return {login:u?.communityOptIn||r.owner===viewer||m===viewer?u?.githubLogin||'Participante':'Participante',profileId:u?.communityOptIn?m:null};})})),hasMore:rows.length>20};
}
async function helpAction(db, user, input) {
  const groups = db.collection('communityGroups');
  if (input.action === 'create') {
    const value = validateHelp(input); const requestKey = `help:${user.githubId}:${value.requestId}`;
    const existing = await groups.findOne({ requestKey }); if (existing) return { id: existing._id.toHexString() };
    if (await groups.countDocuments({ owner: user.githubId, type: 'help', helpStatus: { $ne: 'resolved' } }) >= 5) throw fail('Encerre um dos seus cinco pedidos antes de abrir outro.');
    const result = await groups.updateOne({ requestKey }, { $setOnInsert: { type: 'help', name: value.title, description: value.description, helpLimit: value.limit, helpStatus: 'open', requiresApproval:value.requiresApproval,joinRequests:[], owner: user.githubId, members: [user.githubId], helpers: [], invited: [], createdAt: new Date() } }, { upsert: true });
    const row = result.upsertedId ? { _id: result.upsertedId } : await groups.findOne({ requestKey }); return { id: row._id.toHexString() };
  }
  if (typeof input.id !== 'string' || !/^[a-f0-9]{24}$/.test(input.id)) throw fail('Pedido indisponível.',404);
  const _id = new ObjectId(input.id); const group = await groups.findOne({ _id, type: 'help',moderationHidden:{$ne:true} });
  if (!group) throw fail('Pedido indisponível.',404);
  await requireVisible(db,user,group.owner);
  if (input.action === 'join') {
    if (group.members.includes(user.githubId)) return { id: input.id,joined:true };
    await requireUnblockedPair(db,user.githubId,group.owner);
    if(group.requiresApproval){
      if((group.joinRequests||[]).includes(user.githubId))return {id:input.id,pending:true};
      if(group.helpStatus!=='open'||group.members.length>=group.helpLimit)throw fail('O pedido está encerrado ou atingiu o limite.',409);
      const result=await groups.updateOne({_id,helpStatus:'open',requiresApproval:true,members:{$ne:user.githubId},$expr:{$and:[{$lt:[{$size:'$members'},'$helpLimit']},{$lt:[{$size:{$ifNull:['$joinRequests',[]]}},50]}]}},{$addToSet:{joinRequests:user.githubId}});
      if(!result.matchedCount)throw fail('O pedido não está recebendo solicitações.',409);
      if(result.modifiedCount)await notify(db,group.owner,`help-request:${input.id}:${user.githubId}:${Date.now()}`,'Solicitação de participação',`@${user.githubLogin} pediu para ajudar em “${group.name}”.`,`#community/groups/${input.id}`,{actorId:user.githubId,groupId:input.id});
      return {id:input.id,pending:true};
    }
    const result = await groups.updateOne({ _id, helpStatus: 'open', members: { $ne: user.githubId }, $expr: { $lt: [{ $size: '$members' }, '$helpLimit'] } }, { $addToSet: { members: user.githubId, helpers: { $each: [...group.members.filter(m=>m!==group.owner), user.githubId] } } });
    if (!result.modifiedCount) throw fail('O pedido está encerrado ou atingiu o limite de participantes.',409);
    await notify(db, group.owner, `help-join:${input.id}:${user.githubId}`, 'Alguém chegou para ajudar', `@${user.githubLogin} entrou em “${group.name}”.`, `#community/groups/${input.id}`,{actorId:user.githubId,groupId:input.id});
  } else if(input.action==='cancel-request'){
    await groups.updateOne({_id},{$pull:{joinRequests:user.githubId}});return {id:input.id,pending:false};
  } else if(['approve-request','deny-request'].includes(input.action)){
    if(group.owner!==user.githubId)throw fail('Apenas o dono pode decidir solicitações.',403);
    if(typeof input.githubId!=='string'||!/^\d{1,20}$/.test(input.githubId))throw fail('Participante inválido.');
    if(input.action==='deny-request'){
      const result=await groups.updateOne({_id,owner:user.githubId},{$pull:{joinRequests:input.githubId}});
      if(result.modifiedCount)await notify(db,input.githubId,`help-denied:${input.id}:${input.githubId}:${Date.now()}`,'Solicitação não aprovada',`Sua solicitação em “${group.name}” não foi aprovada.`,`#community/help/${input.id}`,{groupId:input.id});
    }else{
      if(group.members.includes(input.githubId))return {id:input.id,joined:true};
      await requireUnblockedPair(db,user.githubId,input.githubId);
      const result=await groups.updateOne({_id,owner:user.githubId,helpStatus:'open',joinRequests:input.githubId,$expr:{$lt:[{$size:'$members'},'$helpLimit']}},{$addToSet:{members:input.githubId,helpers:input.githubId},$pull:{joinRequests:input.githubId}});
      if(!result.modifiedCount)throw fail('Solicitação indisponível, pedido pausado ou grupo cheio.',409);
      await notify(db,input.githubId,`help-approved:${input.id}:${input.githubId}:${Date.now()}`,'Participação aprovada',`Você pode entrar em “${group.name}”.`,`#community/groups/${input.id}`,{groupId:input.id});
    }
  } else if (input.action === 'save') {
    if(typeof input.saved!=='boolean')throw fail('Marcação inválida.');
    const key=`${user.githubId}:${input.id}`;
    if(input.saved)await db.collection('communityHelpSaves').updateOne({_id:key},{$setOnInsert:{githubId:user.githubId,helpId:input.id,createdAt:new Date()}},{upsert:true});
    else await db.collection('communityHelpSaves').deleteOne({_id:key});
  } else if(input.action==='comment') {
    await require('./comments').addComment(db,user,'help',input.id,input);
  } else if(input.action==='delete-comment') {
    await require('./comments').deleteComment(db,user,'help',input.id,input.commentId);
  } else if (input.action === 'status') {
    if (group.owner !== user.githubId) throw fail('Apenas o autor pode encerrar o pedido.',403);
    if (!['open','paused','resolved'].includes(input.status)) throw fail('Estado inválido.');
    if(input.expectedStatus!==undefined&&input.expectedStatus!==group.helpStatus)throw fail('O estado mudou. Atualize o grupo.',409);
    const result=await groups.updateOne({_id,owner:user.githubId,helpStatus:group.helpStatus},{$set:{helpStatus:input.status,...(input.status==='resolved'?{joinRequests:[],resolvedAt:new Date()}:{})}});
    if(!result.matchedCount)throw fail('O estado mudou. Atualize o grupo.',409);
    if (input.status === 'resolved') await Promise.all(group.members.filter(m => m !== user.githubId).map(m => notify(db,m,`help-resolved:${input.id}`,'Pedido resolvido',`“${group.name}” foi marcado como resolvido.`,`#community/groups/${input.id}`,{actorId:user.githubId,groupId:input.id})));
  } else throw fail('Ação inválida.');
  return { id: input.id };
}
module.exports = { validateHelp, readHelp, helpAction };
