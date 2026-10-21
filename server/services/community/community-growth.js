const {ObjectId}=require('mongodb');
const {boundedText}=require('./text-limits');
const {repositoryURL}=require('../github/repository-url');
const {requireStaff}=require('./permissions');
const {blockedIds,requireUnblockedPair}=require('./safety');
const {notify}=require('./notifications');
const {fail,objectId,requestKey,tags,search,audit,finishAudit}=require('./expansion-utils');
function eventData(input,now=new Date()){
 const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);
 if(!Number.isFinite(+startsAt)||!Number.isFinite(+endsAt)||endsAt<=startsAt||endsAt<=now||endsAt-startsAt>90*86400000)throw fail('Informe início e término válidos, com duração de até 90 dias.');
 if(!Array.isArray(input.requirements)||!input.requirements.length||input.requirements.length>10)throw fail('Defina de um a dez requisitos de entrega.');
 return {title:boundedText(input.title,80,1),description:boundedText(input.description,1500,8),requirements:input.requirements.map(r=>boundedText(r,160,1)),tags:tags(input.tags),startsAt,endsAt};
}
async function readEvents(db,user,q={},now=new Date()){
 const staff=q.admin==='true'?await requireStaff(db,user):null;
 const filter=staff?{}:{status:{$in:['published','cancelled']}};
 if(q.id)filter._id=objectId(q.id);else if(q.before)filter._id={$lt:objectId(q.before)};
 const rows=await db.collection('communityEvents').find(filter).sort({_id:-1}).limit(21).toArray();const hidden=await blockedIds(db,user);
 if(q.entriesBefore&&(typeof q.entriesBefore!=='string'||!/^\d{1,20}$/.test(q.entriesBefore)||!q.id))throw fail('Página de entregas inválida.');
 const eventIds=rows.map(r=>String(r._id));
 const [grouped,mineEntries]=await Promise.all([
  q.id||staff?db.collection('communityEventEntries').aggregate([{$match:{eventId:{$in:eventIds},githubId:{$nin:hidden,...(q.entriesBefore?{$lt:q.entriesBefore}:{})},withdrawn:{$ne:true}}},{$group:{_id:'$eventId',rows:{$topN:{sortBy:{githubId:-1},output:'$$ROOT',n:51}}}}]).toArray():Promise.resolve([]),
  db.collection('communityEventEntries').find({eventId:{$in:eventIds},githubId:user.githubId}).toArray()
 ]);
 const items=rows.slice(0,20).map(e=>{
  const submissions=grouped.find(g=>g._id===String(e._id))?.rows||[];const mine=mineEntries.find(m=>m.eventId===String(e._id));
  return {id:String(e._id),title:e.title,description:e.description,requirements:e.requirements,tags:e.tags,startsAt:e.startsAt,endsAt:e.endsAt,status:e.status,version:e.version,phase:e.status==='cancelled'?'cancelled':e.status==='draft'?'draft':now<e.startsAt?'upcoming':now<e.endsAt?'open':'ended',mine:mine&&!mine.withdrawn?{repository:mine.repository,note:mine.note,status:mine.status,reviewNote:mine.reviewNote||'',submittedAt:mine.submittedAt,version:mine.version}:null,entries:submissions.slice(0,50).map(s=>({githubId:s.githubId,login:s.login,repository:s.repository,note:s.note,status:s.status,version:s.version})),hasMoreEntries:submissions.length>50};
 });
 return {items,hasMore:rows.length>20};
}
async function eventAction(db,user,input,now=new Date()){
 const events=db.collection('communityEvents');
 if(input.action==='create'){
  const staff=await requireStaff(db,user);const value=eventData(input,now);const key=requestKey(user,input,'event');
  const auditId=await audit(db,staff,input,'event-create',key,now);
  await events.updateOne({requestKey:key},{$setOnInsert:{...value,status:'draft',owner:user.githubId,version:1,createdAt:now}},{upsert:true});const row=await events.findOne({requestKey:key});await finishAudit(db,auditId);return {id:String(row._id)};
 }
 const _id=objectId(input.id);const event=await events.findOne({_id});if(!event)throw fail('Evento indisponível.',404);const eventId=String(_id);
 if(['publish','cancel'].includes(input.action)){
  const staff=await requireStaff(db,user);const a=await audit(db,staff,input,`event-${input.action}`,eventId,now);const target=input.action==='publish'?'published':'cancelled';
  if(event.lastOperation!==a){if(input.version!==event.version)throw fail('O evento mudou. Atualize a página.',409);if(input.action==='publish'&&(event.status!=='draft'||event.endsAt<=now))throw fail('Somente rascunhos com prazo disponível podem ser publicados.',409);const r=await events.updateOne({_id,version:input.version},{$set:{status:target,lastOperation:a},$inc:{version:1}});if(!r.matchedCount)throw fail('O evento mudou. Atualize a página.',409);}
  await finishAudit(db,a);
 }else if(input.action==='submit'||input.action==='withdraw'){
  if(event.status!=='published'||now<event.startsAt||now>=event.endsAt)throw fail('Entregas são aceitas somente durante o prazo do evento.',409);
  const entries=db.collection('communityEventEntries');const key=`${eventId}:${user.githubId}`;
  if(input.action==='withdraw')await entries.updateOne({_id:key},{$set:{withdrawn:true},$inc:{version:1}});
  else{
   const repository=repositoryURL(input.repository);const note=boundedText(input.note||'',400,3,true);
   await entries.updateOne({_id:key},{$set:{eventId,githubId:user.githubId,login:user.githubLogin,repository,note,submittedAt:now,status:'pending',withdrawn:false},$unset:{reviewNote:'',reviewedAt:''},$inc:{version:1}},{upsert:true});
  }
 }else if(input.action==='review'){
  const staff=await requireStaff(db,user);if(!['accepted','changes-requested'].includes(input.status)||typeof input.githubId!=='string'||!/^\d{1,20}$/.test(input.githubId))throw fail('Avaliação inválida.');
  const note=boundedText(input.note,500,4);const key=await audit(db,staff,input,'event-review',`${eventId}:${input.githubId}`,now);
  if(!Number.isInteger(input.version)||input.version<1)throw fail('Atualize a entrega antes de avaliar.',409);
  const entries=db.collection('communityEventEntries');const entryId=`${eventId}:${input.githubId}`;
  const result=await entries.updateOne({_id:entryId,withdrawn:{$ne:true},version:input.version},{$set:{status:input.status,reviewNote:note,reviewedAt:now,lastReviewOperation:key},$inc:{version:1}});
  if(!result.matchedCount&&!await entries.findOne({_id:entryId,withdrawn:{$ne:true},lastReviewOperation:key,version:input.version+1}))throw fail('A entrega mudou ou está indisponível. Atualize antes de avaliar.',409);
  await notify(db,input.githubId,`event-review:${key}`,'Sua entrega foi avaliada',`${event.title}: ${note}`,`#community/events/${eventId}`);await finishAudit(db,key);
 }else throw fail('Ação inválida.');return {id:eventId};
}
async function readDiscovery(db,user){
 const [fresh,follows]=await Promise.all([db.collection('users').findOne({_id:user._id},{projection:{communityInterests:1,communityOnboarding:1}}),db.collection('communityUserFollows').find({githubId:user.githubId}).limit(500).toArray()]);
 const hidden=await blockedIds(db,user);
 const people=await db.collection('users').find({githubId:{$in:follows.map(f=>f.targetId),$nin:hidden}},{projection:{githubId:1,githubLogin:1,communityOptIn:1}}).toArray();
 const goal=await db.collection('projectGoals').findOne({_id:user.githubId},{projection:{'goal.id':1}});
 const hasPost=Boolean(await db.collection('communityPosts').findOne({githubId:user.githubId,deletedAt:{$exists:false}},{projection:{_id:1}}));
 return {interests:fresh?.communityInterests||[],dismissed:Boolean(fresh?.communityOnboarding?.dismissed),following:people.map(p=>({githubId:p.githubId,login:p.githubLogin,profileId:p.communityOptIn?p.githubId:null})),steps:{github:true,goal:Boolean(goal?.goal),xp:Boolean(fresh?.communityOnboarding?.xpReadAt),interaction:hasPost||Boolean(await db.collection('communityHelpComments').findOne({githubId:user.githubId,deletedAt:{$exists:false}},{projection:{_id:1}}))||Boolean(await db.collection('communityComments').findOne({githubId:user.githubId,deletedAt:{$exists:false}},{projection:{_id:1}}))||Boolean(await db.collection('communityGroups').findOne({type:'help',owner:{$ne:user.githubId},members:user.githubId},{projection:{_id:1}}))}};
}
async function discoveryAction(db,user,input){
 if(input.action==='interests')await db.collection('users').updateOne({_id:user._id},{$set:{communityInterests:tags(input.tags)}});
 else if(input.action==='onboarding'){
  if(!['dismiss','resume','xp-read'].includes(input.step))throw fail('Etapa inválida.');
  await db.collection('users').updateOne({_id:user._id},{$set:input.step==='xp-read'?{'communityOnboarding.xpReadAt':new Date()}:{'communityOnboarding.dismissed':input.step==='dismiss'}});
 }else if(input.action==='follow-user'){
  if(typeof input.githubId!=='string'||!/^\d{1,20}$/.test(input.githubId)||typeof input.following!=='boolean'||input.githubId===user.githubId)throw fail('Usuário inválido.');
  const key=`${user.githubId}:${input.githubId}`;
  if(!input.following)await db.collection('communityUserFollows').deleteOne({_id:key});
  else{await requireUnblockedPair(db,user.githubId,input.githubId);if(!await db.collection('users').findOne({githubId:input.githubId,communityOptIn:true}))throw fail('Perfil indisponível.',404);if(await db.collection('communityUserFollows').countDocuments({githubId:user.githubId})>=500&&!await db.collection('communityUserFollows').findOne({_id:key}))throw fail('Limite de 500 pessoas acompanhadas.');await db.collection('communityUserFollows').updateOne({_id:key},{$setOnInsert:{githubId:user.githubId,targetId:input.githubId,createdAt:new Date()}},{upsert:true});}
 }else throw fail('Ação inválida.');return readDiscovery(db,user);
}
async function readCommunityTools(db,user){
 await requireStaff(db,user);const since=new Date(Date.now()-30*86400000);const [projects,events,posts,groups,entries,updates,schedules,unanswered]=await Promise.all([
  db.collection('communityProjects').countDocuments({status:'active',moderationHidden:{$ne:true}}),db.collection('communityEvents').countDocuments({status:'published',endsAt:{$gt:new Date()}}),db.collection('communityPosts').countDocuments({createdAt:{$gte:since},deletedAt:{$exists:false},moderationHidden:{$ne:true}}),db.collection('communityGroups').countDocuments({type:'help',createdAt:{$gte:since},helpStatus:'resolved',moderationHidden:{$ne:true}}),db.collection('communityEventEntries').countDocuments({status:'pending',withdrawn:{$ne:true}}),db.collection('communityProjectUpdates').countDocuments({createdAt:{$gte:since}}),db.collection('communityAnnouncements').find({}).sort({dueAt:-1}).limit(50).toArray(),
  db.collection('communityGroups').aggregate([{$match:{type:'help',helpStatus:'open',moderationHidden:{$ne:true}}},{$sort:{createdAt:1}},{$lookup:{from:'communityHelpComments',let:{id:{$toString:'$_id'},owner:'$owner'},pipeline:[{$match:{$expr:{$and:[{$eq:['$helpId','$$id']},{$ne:['$githubId','$$owner']}]},deletedAt:{$exists:false},moderationHidden:{$ne:true}}},{$limit:1}],as:'suggestions'}},{$match:{'suggestions.0':{$exists:false},$expr:{$lte:[{$size:'$members'},1]}}},{$limit:20},{$project:{name:1,createdAt:1,helpCategory:1}}]).toArray()
 ]);
 return {metrics:{activeProjects:projects,availableEvents:events,posts30d:posts,resolvedHelp30d:groups,pendingEntries:entries,projectUpdates30d:updates},schedules:schedules.map(s=>({id:String(s._id),title:s.title,message:s.message,dueAt:s.dueAt,status:s.status,version:s.version})),unanswered:unanswered.map(r=>({id:String(r._id),title:r.name,createdAt:r.createdAt,category:r.helpCategory||'general'}))};
}
async function toolsAction(db,user,input,now=new Date()){
 const staff=await requireStaff(db,user);const auditId=await audit(db,staff,input,`announcement-${input.action}`,input.id||'new',now);
 if(input.action==='schedule'){
  const dueAt=new Date(input.dueAt);if(!Number.isFinite(+dueAt)||dueAt<now||dueAt-now>90*86400000)throw fail('Agende um horário futuro nos próximos 90 dias.');
  const key=requestKey(user,input,'announcement');await db.collection('communityAnnouncements').updateOne({requestKey:key},{$setOnInsert:{title:boundedText(input.title,80,1),message:boundedText(input.message,1000,8),dueAt,status:'scheduled',actorId:user.githubId,createdAt:now}},{upsert:true});
 }else if(input.action==='cancel'){
  const result=await db.collection('communityAnnouncements').updateOne({_id:objectId(input.id),status:'scheduled'},{$set:{status:'cancelled'}});if(!result.matchedCount&&!await db.collection('communityAnnouncements').findOne({_id:objectId(input.id),status:'cancelled'}))throw fail('O aviso já está em envio ou foi publicado.',409);
 }else throw fail('Ação inválida.');await finishAudit(db,auditId);return {ok:true};
}
async function dispatchAnnouncements(db,now=new Date()){
 for(let i=0;i<25;i++){
  const claim=await db.collection('communityAnnouncements').findOneAndUpdate({dueAt:{$lte:now},$or:[{status:'scheduled'},{status:'processing',leaseUntil:{$lte:now}}]},{$set:{status:'processing',leaseUntil:new Date(+now+60000)}},{sort:{dueAt:1},returnDocument:'after'});const row=claim.value;if(!row)return;
  await notify(db,'*',`scheduled:${row._id}`,row.title,row.message,'#community');
  await db.collection('communityAnnouncements').updateOne({_id:row._id,status:'processing'},{$set:{status:'sent',sentAt:now}});
 }
}
module.exports={readEvents,eventAction,eventData,readDiscovery,discoveryAction,readCommunityTools,toolsAction,dispatchAnnouncements};
