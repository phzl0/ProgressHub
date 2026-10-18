const { ObjectId } = require('mongodb');
const { boundedText } = require('./text-limits');
const {blockedIds,requireVisible}=require('./safety');
const { notify } = require('./notifications');
const helpersFor = r => [...new Set([...(r.helpers||[]),...r.members.filter(m=>m!==r.owner)])];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateHelp(input) {
  const title = boundedText(input.title,80,1);
  const description = boundedText(input.description,2000,8);
  const limit = input.limit;
  if (!title || title.length > 80 || !description || description.length > 2000 || !Number.isInteger(limit) || limit < 2 || limit > 20) throw fail('Informe título (80 caracteres), descrição (2.000) e limite de 2 a 20 participantes.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Pedido inválido.');
  return { title, description, limit, requestId: input.requestId };
}
async function readHelp(db, user, query = {}) {
  const hidden=await blockedIds(db,user);
  const filter = { type: 'help',$and:[{owner:{$nin:hidden}}] }; const viewer=user?.githubId;
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
  const counts=await db.collection('communityHelpComments').aggregate([{$match:{helpId:{$in:ids},githubId:{$nin:hidden},deletedAt:{$exists:false}}},{$group:{_id:'$helpId',count:{$sum:1}}}]).toArray();
  return {requests:rows.slice(0,20).map(r=>({id:r._id.toHexString(),title:r.name,description:r.description,status:r.helpStatus,limit:r.helpLimit,count:r.members.length,joined:r.members.includes(viewer),own:r.owner===viewer,authorId:r.owner,author:users.find(u=>u.githubId===r.owner)?.githubLogin||'Participante',createdAt:r.createdAt,saved:saved.some(s=>s.helpId===r._id.toHexString()),commentCount:counts.find(c=>c._id===r._id.toHexString())?.count||0,helpers:helpersFor(r).map(m=>{const u=users.find(u=>u.githubId===m);return {login:u?.communityOptIn||r.owner===viewer||m===viewer?u?.githubLogin||'Participante':'Participante',profileId:u?.communityOptIn?m:null};})})),hasMore:rows.length>20};
}
async function helpAction(db, user, input) {
  const groups = db.collection('communityGroups');
  if (input.action === 'create') {
    const value = validateHelp(input); const requestKey = `help:${user.githubId}:${value.requestId}`;
    const existing = await groups.findOne({ requestKey }); if (existing) return { id: existing._id.toHexString() };
    if (await groups.countDocuments({ owner: user.githubId, type: 'help', helpStatus: { $ne: 'resolved' } }) >= 5) throw fail('Encerre um dos seus cinco pedidos antes de abrir outro.');
    const result = await groups.updateOne({ requestKey }, { $setOnInsert: { type: 'help', name: value.title, description: value.description, helpLimit: value.limit, helpStatus: 'open', owner: user.githubId, members: [user.githubId], helpers: [], invited: [], createdAt: new Date() } }, { upsert: true });
    const row = result.upsertedId ? { _id: result.upsertedId } : await groups.findOne({ requestKey }); return { id: row._id.toHexString() };
  }
  if (typeof input.id !== 'string' || !/^[a-f0-9]{24}$/.test(input.id)) throw fail('Pedido indisponível.',404);
  const _id = new ObjectId(input.id); const group = await groups.findOne({ _id, type: 'help' });
  if (!group) throw fail('Pedido indisponível.',404);
  await requireVisible(db,user,group.owner);
  if (input.action === 'join') {
    if (group.members.includes(user.githubId)) return { id: input.id };
    const result = await groups.updateOne({ _id, helpStatus: 'open', members: { $ne: user.githubId }, $expr: { $lt: [{ $size: '$members' }, '$helpLimit'] } }, { $addToSet: { members: user.githubId, helpers: { $each: [...group.members.filter(m=>m!==group.owner), user.githubId] } } });
    if (!result.modifiedCount) throw fail('O pedido está encerrado ou atingiu o limite de participantes.',409);
    await notify(db, group.owner, `help-join:${input.id}:${user.githubId}`, 'Alguém chegou para ajudar', `@${user.githubLogin} entrou em “${group.name}”.`, `#community/groups/${input.id}`,{actorId:user.githubId,groupId:input.id});
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
    await groups.updateOne({ _id, owner: user.githubId }, { $set: { helpStatus: input.status } });
    if (input.status === 'resolved') await Promise.all(group.members.filter(m => m !== user.githubId).map(m => notify(db,m,`help-resolved:${input.id}`,'Pedido resolvido',`“${group.name}” foi marcado como resolvido.`,`#community/groups/${input.id}`,{actorId:user.githubId,groupId:input.id})));
  } else throw fail('Ação inválida.');
  return { id: input.id };
}
module.exports = { validateHelp, readHelp, helpAction };
