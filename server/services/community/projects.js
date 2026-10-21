const {ObjectId}=require('mongodb');
const {boundedText}=require('./text-limits');
const {repositoryURL}=require('../github/repository-url');
const {blockedIds,requireVisible,requireUnblockedPair}=require('./safety');
const {notify}=require('./notifications');
const {fail,objectId,requestKey,tags,search}=require('./expansion-utils');
const ROLES=['frontend','backend','design','documentation','testing','fullstack'];
const STATES=['active','paused','completed','archived'];
function projectData(input){
 const steps=input.steps;
 if(!Array.isArray(steps)||steps.length<1||steps.length>12)throw fail('Informe de uma a 12 etapas.');
 const roles=input.roles||[];if(!Array.isArray(roles)||roles.length>6||roles.some(role=>!ROLES.includes(role)))throw fail('Função de colaboração inválida.');
 return {language:boundedText(input.language||'Não informada',32,1),title:boundedText(input.title,80,1),description:boundedText(input.description,1000,6),repository:repositoryURL(input.repository),tags:tags(input.tags),roles:[...new Set(roles)],steps:steps.map((label,i)=>({id:String(i+1),label:boundedText(label,120,1),done:false}))};
}
async function readProjects(db,user,q={}){
 const hidden=await blockedIds(db,user);const filter={moderationHidden:{$ne:true},owner:{$nin:hidden}};
 if(q.id)filter._id=objectId(q.id);
 else{
  if(q.tab==='mine')filter.owner=user.githubId;
  else if(q.tab==='following'){const rows=await db.collection('communityProjectFollows').find({githubId:user.githubId}).limit(500).toArray();filter._id={$in:rows.map(r=>objectId(r.projectId))};}
  else if(q.tab&&q.tab!=='all')throw fail('Coleção inválida.');
  if(q.owner){if(!/^\d{1,20}$/.test(q.owner)||q.owner!==user.githubId&&!await db.collection('users').findOne({githubId:q.owner,communityOptIn:true}))throw fail('Perfil indisponível.',404);filter.owner=q.owner;}
  if(q.status){if(!STATES.includes(q.status))throw fail('Estado inválido.');filter.status=q.status;}
  if(q.tag)filter.tags=tags([q.tag])[0];
  const term=search(q.q);if(term)filter.$or=[{title:{$regex:term,$options:'i'}},{description:{$regex:term,$options:'i'}}];
  if(q.before)filter.$and=[{_id:{$lt:objectId(q.before)}}];
 }
 const rows=await db.collection('communityProjects').find(filter).sort({_id:-1}).limit(21).toArray();
 const ids=rows.map(r=>String(r._id));const owned=rows.filter(r=>r.owner===user.githubId).map(r=>String(r._id));
 const [people,follows,applications,allUpdates]=await Promise.all([
  db.collection('users').find({githubId:{$in:[...new Set(rows.flatMap(p=>[p.owner,...p.members]))]}},{projection:{githubId:1,githubLogin:1,communityOptIn:1}}).toArray(),
  db.collection('communityProjectFollows').find({githubId:user.githubId,projectId:{$in:ids}}).toArray(),
  db.collection('communityProjectApplications').find({projectId:{$in:ids},$or:[{githubId:user.githubId},{projectId:{$in:owned},status:{$in:['pending','accepting']}}]}).sort({_id:-1}).limit(1100).toArray(),
  q.id?db.collection('communityProjectUpdates').find({projectId:q.id}).sort({createdAt:-1,_id:-1}).limit(20).toArray():Promise.resolve([])
 ]);
 const items=[];
 for(const p of rows.slice(0,20)){
  const own=p.owner===user.githubId;
  const requests=own?applications.filter(a=>a.projectId===String(p._id)&&['pending','accepting'].includes(a.status)).slice(0,50):[];
  const mine=applications.find(a=>a.projectId===String(p._id)&&a.githubId===user.githubId);
  const updates=allUpdates.filter(a=>a.projectId===String(p._id));
  const person=githubId=>{const a=people.find(a=>a.githubId===githubId);return {login:a?.githubLogin||'Participante',profileId:a?.communityOptIn?githubId:null};};
  items.push({id:String(p._id),title:p.title,language:p.language||'Não informada',description:p.description,repository:p.repository,tags:p.tags,roles:p.roles,steps:p.steps,status:p.status,version:p.version,createdAt:p.createdAt,own,member:p.members.includes(user.githubId),authorId:p.owner,following:follows.some(f=>f.projectId===String(p._id)),author:person(p.owner),members:p.members.filter(id=>!hidden.includes(id)).map(id=>({...person(id),...(own?{id}: {})})),application:mine?{role:mine.role,status:mine.status,attemptId:mine.attemptId||null}:null,requests:requests.filter(r=>!hidden.includes(r.githubId)).map(r=>({id:r.githubId,login:r.login,role:r.role,message:r.message,attemptId:r.attemptId||null})),updates:updates.filter(r=>!hidden.includes(r.githubId)).map(r=>({id:String(r._id),text:r.text,createdAt:r.createdAt,author:r.login}))});
 }
 return {items,hasMore:rows.length>20,roles:ROLES};
}
async function projectAction(db,user,input){
 const projects=db.collection('communityProjects');
 if(input.action==='create'){
  if(input.fromGoal!==undefined&&typeof input.fromGoal!=='boolean')throw fail('Importação inválida.');
  const key=requestKey(user,input,'project');const previous=await projects.findOne({requestKey:key});if(previous)return {id:String(previous._id)};
  if(await projects.countDocuments({owner:user.githubId,status:{$ne:'archived'}})>=10)throw fail('Limite de dez projetos por responsável.');
  let data=input;
  if(input.fromGoal){const record=await db.collection('projectGoals').findOne({_id:user.githubId});if(!record?.goal)throw fail('Crie uma meta pessoal primeiro.');const g=record.goal;data={title:g.title,description:g.description||g.title,repository:g.repository,tags:input.tags,roles:input.roles,steps:g.steps.map(s=>s.label)};}
  const value=projectData(data);
  await projects.updateOne({requestKey:key},{$setOnInsert:{...value,owner:user.githubId,members:[user.githubId],status:'active',version:1,createdAt:new Date()}},{upsert:true});
  return {id:String((await projects.findOne({requestKey:key}))._id)};
 }
 const _id=objectId(input.id);const p=await projects.findOne({_id,moderationHidden:{$ne:true}});if(!p)throw fail('Projeto indisponível.',404);await requireVisible(db,user,p.owner);const projectId=String(_id);
 if(input.action==='follow'){
  if(typeof input.following!=='boolean')throw fail('Marcação inválida.');
  if(input.following){await requireUnblockedPair(db,user.githubId,p.owner);if(await db.collection('communityProjectFollows').countDocuments({githubId:user.githubId})>=500&&!await db.collection('communityProjectFollows').findOne({_id:`${projectId}:${user.githubId}`}))throw fail('Limite de 500 projetos acompanhados.');await db.collection('communityProjectFollows').updateOne({_id:`${projectId}:${user.githubId}`},{$setOnInsert:{projectId,githubId:user.githubId,createdAt:new Date()}},{upsert:true});}
  else await db.collection('communityProjectFollows').deleteOne({_id:`${projectId}:${user.githubId}`});
 }else if(input.action==='apply'){
  if(p.owner===user.githubId||p.members.includes(user.githubId)||p.status!=='active'||!p.roles.includes(input.role))throw fail('Este projeto não está recebendo essa candidatura.',409);
  await requireUnblockedPair(db,user.githubId,p.owner);
  if(await db.collection('communityProjectApplications').countDocuments({projectId,status:'pending'})>=50)throw fail('O projeto atingiu o limite de solicitações pendentes.');
  const applications=db.collection('communityProjectApplications');const previous=await applications.findOne({_id:`${projectId}:${user.githubId}`});const message=boundedText(input.message,400,3);
  if(previous?.status==='withdrawn')await applications.updateOne({_id:previous._id,status:'withdrawn'},{$set:{status:'pending',attemptId:new ObjectId().toHexString(),role:input.role,message,createdAt:new Date()}});
  else await applications.updateOne({_id:`${projectId}:${user.githubId}`},{$setOnInsert:{projectId,githubId:user.githubId,login:user.githubLogin,role:input.role,message,status:'pending',attemptId:new ObjectId().toHexString(),createdAt:new Date()}},{upsert:true});
  const application=await applications.findOne({_id:`${projectId}:${user.githubId}`});if(application.status==='pending')await notify(db,p.owner,`project-apply:${projectId}:${user.githubId}:${application.attemptId||'initial'}`,'Solicitação de colaboração',`@${user.githubLogin} quer colaborar em ${p.title}.`,`#community/projects/${projectId}`,{actorId:user.githubId});
 }else if(input.action==='cancel-application'){
  const a=await db.collection('communityProjectApplications').findOne({_id:`${projectId}:${user.githubId}`});if(!a)throw fail('Solicitação indisponível.',404);if(input.attemptId&&input.attemptId!==a.attemptId)throw fail('A candidatura mudou. Atualize o projeto.',409);if(a.status==='withdrawn')return {id:projectId};
  const result=await db.collection('communityProjectApplications').updateOne({_id:a._id,...(a.attemptId?{attemptId:a.attemptId}:{}),status:'pending'},{$set:{status:'withdrawn'}});if(!result.matchedCount)throw fail('A solicitação já foi decidida. Atualize o projeto.',409);
 }else if(['leave','remove-member'].includes(input.action)){
  const target=input.action==='leave'?user.githubId:input.githubId;if(input.action==='remove-member'&&p.owner!==user.githubId)throw fail('Apenas o responsável pode remover colaboradores.',403);
  if(typeof target!=='string'||!/^\d{1,20}$/.test(target)||target===p.owner)throw fail('O responsável não pode sair da própria equipe.',409);
  if(!p.members.includes(target)){await db.collection('communityProjectApplications').updateOne({_id:`${projectId}:${target}`,status:'accepted'},{$set:{status:'withdrawn'}});return {id:projectId};}if(!Number.isInteger(input.version)||input.version!==p.version)throw fail('A equipe mudou. Atualize o projeto.',409);
  const key=requestKey(user,input,'project-team');const result=await projects.updateOne({_id,version:input.version,members:target},{$pull:{members:target},$inc:{version:1}});if(!result.matchedCount)throw fail('A equipe mudou. Atualize o projeto.',409);
  await db.collection('communityProjectApplications').updateOne({_id:`${projectId}:${target}`},{$set:{status:'withdrawn'}});
  await notify(db,input.action==='leave'?p.owner:target,key,'Atualização da equipe',input.action==='leave'?`@${user.githubLogin} saiu de ${p.title}.`:`Você foi removido da equipe de ${p.title}.`,`#community/projects/${projectId}`,{actorId:user.githubId,category:'collaboration'});
 }else if(input.action==='application-decision'){
  if(p.owner!==user.githubId)throw fail('Apenas o responsável pode decidir.',403);
  if(!['accepted','declined'].includes(input.status)||typeof input.githubId!=='string'||!/^\d{1,20}$/.test(input.githubId))throw fail('Decisão inválida.');
  const applications=db.collection('communityProjectApplications');const a=await applications.findOne({_id:`${projectId}:${input.githubId}`});if(!a)throw fail('Solicitação indisponível.',404);
  if(input.attemptId&&input.attemptId!==a.attemptId)throw fail('A candidatura mudou. Atualize o projeto.',409);
  if(a.status!==input.status&&a.status!=='pending'&&!(a.status==='accepting'&&input.status==='accepted'))throw fail('A solicitação já foi decidida.',409);
  await requireUnblockedPair(db,user.githubId,a.githubId);
  if(input.status==='accepted'&&a.status==='accepted'&&p.members.includes(a.githubId)){await notify(db,a.githubId,`project-decision:${a._id}:${a.attemptId||'initial'}:accepted`,'Colaboração no projeto',`Sua solicitação em ${p.title} foi aceita.`,`#community/projects/${projectId}`,{actorId:user.githubId});return {id:projectId};}
  const decision=await applications.updateOne({_id:a._id,...(a.attemptId?{attemptId:a.attemptId}:{}),status:{$in:input.status==='accepted'?['pending','accepting','accepted']:['pending','declined']}},{$set:{status:input.status==='accepted'&&a.status!=='accepted'?'accepting':input.status}});
  if(!decision.matchedCount)throw fail('A solicitação já foi decidida.',409);
  if(input.status==='accepted'){const r=await projects.updateOne({_id,version:p.version,status:'active',$or:[{members:a.githubId},{$expr:{$lt:[{$size:'$members'},20]}}]},{$addToSet:{members:a.githubId},$inc:{version:1}});if(!r.matchedCount){await applications.updateOne({_id:a._id,...(a.attemptId?{attemptId:a.attemptId}:{}),status:'accepting'},{$set:{status:'pending'}});throw fail('A equipe mudou, o projeto foi encerrado ou está cheio. Atualize e tente novamente.',409);}await applications.updateOne({_id:a._id,...(a.attemptId?{attemptId:a.attemptId}:{}),status:'accepting'},{$set:{status:'accepted'}});}
  await notify(db,a.githubId,`project-decision:${a._id}:${a.attemptId||'initial'}:${input.status}`,'Colaboração no projeto',`Sua solicitação em ${p.title} foi ${input.status==='accepted'?'aceita':'recusada'}.`,`#community/projects/${projectId}`,{actorId:user.githubId});
 }else if(input.action==='update'){
  if(!p.members.includes(user.githubId)||p.status==='archived')throw fail('Somente a equipe pode publicar atualizações em projetos disponíveis.',403);
  const key=requestKey(user,input,'project-update');await db.collection('communityProjectUpdates').updateOne({_id:key},{$setOnInsert:{projectId,githubId:user.githubId,login:user.githubLogin,text:boundedText(input.text,1000,6),createdAt:new Date()}},{upsert:true});
  const update=await db.collection('communityProjectUpdates').findOne({_id:key});if(update.projectId!==projectId)throw fail('Esta tentativa pertence a outro projeto.',409);
  await db.collection('communityPosts').updateOne({requestKey:key},{$setOnInsert:{githubId:user.githubId,text:update.text.slice(0,200).split('\n').slice(0,3).join('\n'),image:'',kind:'project',projectId,projectOwner:p.owner,tags:p.tags,createdAt:update.createdAt}},{upsert:true});
  await require('./project-notification-jobs').queueProjectUpdate(db,p,update);
 }else if(['step','status','edit'].includes(input.action)){
  if(p.owner!==user.githubId)throw fail('Apenas o responsável pode editar o projeto.',403);
  if(!Number.isInteger(input.version)||input.version!==p.version)throw fail('O projeto mudou. Atualize antes de editar.',409);
  let changes={};
  if(input.action==='status'){if(!STATES.includes(input.status))throw fail('Estado inválido.');changes.status=input.status;}
  if(input.action==='step'){if(typeof input.done!=='boolean'||!p.steps.some(s=>s.id===input.stepId))throw fail('Etapa inválida.');changes.steps=p.steps.map(s=>s.id===input.stepId?{...s,done:input.done}:s);}
  if(input.action==='edit'){changes=projectData(input);changes.steps=changes.steps.map(s=>({...s,done:p.steps.some(old=>old.label===s.label&&old.done)}));}
  const r=await projects.updateOne({_id,owner:user.githubId,version:input.version},{$set:{...changes,updatedAt:new Date()},$inc:{version:1}});if(!r.matchedCount)throw fail('O projeto mudou. Atualize antes de editar.',409);
 }else throw fail('Ação inválida.');
 return {id:projectId};
}
module.exports={readProjects,projectAction,projectData,ROLES};
