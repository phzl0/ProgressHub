const {ObjectId}=require('mongodb');
const {blockedIds,requireVisible}=require('./safety');
const {search,fail,objectId}=require('./expansion-utils');
async function readGallery(db,user={},q={}){
 const hidden=await blockedIds(db,user);const filter={moderationHidden:{$ne:true},owner:{$nin:hidden},status:{$ne:'archived'}};
 const term=search(q.q);if(term)filter.$or=[{title:{$regex:term,$options:'i'}},{description:{$regex:term,$options:'i'}}];
 if(q.language){if(typeof q.language!=='string'||q.language.length>32)throw fail('Linguagem inválida.');filter.language=q.language;}
 const rows=await db.collection('communityProjects').aggregate([{$match:filter},{$set:{projectId:{$toString:'$_id'}}},{$lookup:{from:'communityProjectReactions',localField:'projectId',foreignField:'projectId',pipeline:[{$group:{_id:null,likes:{$sum:{$cond:['$liked',1,0]}},favorites:{$sum:{$cond:['$favorite',1,0]}}}}],as:'totals'}},{$set:{likes:{$ifNull:[{$first:'$totals.likes'},0]},favorites:{$ifNull:[{$first:'$totals.favorites'},0]}}},{$sort:{likes:-1,favorites:-1,_id:-1}},{$limit:10},{$lookup:{from:'users',localField:'owner',foreignField:'githubId',pipeline:[{$project:{githubLogin:1,picture:1}}],as:'person'}}]).toArray();
 const mine=user.githubId?await db.collection('communityProjectReactions').find({githubId:user.githubId,projectId:{$in:rows.map(r=>r.projectId)}}).toArray():[];
 const languages=await db.collection('communityProjects').distinct('language',{moderationHidden:{$ne:true},owner:{$nin:hidden},status:{$ne:'archived'},language:{$type:'string',$ne:''}});
 return {languages:languages.sort().slice(0,100),items:rows.map(p=>({id:p.projectId,title:p.title,description:p.description,language:p.language||'Não informada',likes:p.likes,favorites:p.favorites,liked:Boolean(mine.find(r=>r.projectId===p.projectId)?.liked),favorite:Boolean(mine.find(r=>r.projectId===p.projectId)?.favorite),author:{githubId:p.owner,login:p.person[0]?.githubLogin||'Participante',picture:p.person[0]?.picture||''},completed:p.steps.filter(s=>s.done).length,total:p.steps.length}))};
}
async function reactToProject(db,user,input){
 const _id=objectId(input.id);if(!['liked','favorite'].includes(input.field)||typeof input.value!=='boolean')throw fail('Reação inválida.');
 const p=await db.collection('communityProjects').findOne({_id,moderationHidden:{$ne:true}});if(!p)throw fail('Projeto indisponível.',404);await requireVisible(db,user,p.owner);
 await db.collection('communityProjectReactions').updateOne({_id:`${input.id}:${user.githubId}`},{$set:{[input.field]:input.value},$setOnInsert:{projectId:input.id,githubId:user.githubId}},{upsert:true});return {ok:true};
}
module.exports={readGallery,reactToProject};
