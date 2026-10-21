const {notify}=require('./notifications');
async function queueProjectUpdate(db,project,update){const day=new Date(update.createdAt).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});await db.collection('communityNotificationJobs').updateOne({_id:`project:${project._id}:${day}`},{$setOnInsert:{projectId:String(project._id),title:project.title,actorId:update.githubId,login:update.login,createdAt:new Date(),status:'pending',cursor:''}},{upsert:true});}
async function dispatchProjectNotifications(db,now=new Date()){
 for(let n=0;n<5;n++){
  const token=require('crypto').randomUUID();const result=await db.collection('communityNotificationJobs').findOneAndUpdate({$or:[{status:'pending'},{status:'processing',leaseUntil:{$lte:now}}]},{$set:{status:'processing',leaseUntil:new Date(+now+60000),leaseToken:token}},{sort:{createdAt:1},returnDocument:'after'});const job=result.value;if(!job)return;
  const project=await db.collection('communityProjects').findOne({_id:new(require('mongodb').ObjectId)(job.projectId),moderationHidden:{$ne:true}});if(!project){await db.collection('communityNotificationJobs').updateOne({_id:job._id,leaseToken:token},{$set:{status:'done',completedAt:now}});continue;}
  const rows=await db.collection('communityProjectFollows').find({projectId:job.projectId,githubId:{$gt:job.cursor,$ne:job.actorId},createdAt:{$lte:job.createdAt}}).sort({githubId:1}).limit(100).toArray();
  for(const row of rows){const blocked=await db.collection('communityBlocks').findOne({githubId:row.githubId,blockedId:project.owner});if(!blocked)await notify(db,row.githubId,`${job._id}:${row.githubId}`,'Novidade em projeto acompanhado',`${job.title} tem novas atividades. Confira as atualizações e conversas.`,`#community/projects/${job.projectId}`,{actorId:job.actorId,category:'projects'});}
  await db.collection('communityNotificationJobs').updateOne({_id:job._id,status:'processing',leaseToken:token},{$set:rows.length===100?{status:'pending',cursor:rows.at(-1).githubId}:{status:'done',completedAt:now}});
 }
}
module.exports={queueProjectUpdate,dispatchProjectNotifications};
