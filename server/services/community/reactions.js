const {ObjectId}=require('mongodb');
const REACTIONS=['heart','like','laugh','sad'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function reactionSummaries(db,kind,ids,viewer) {
  if(!ids.length)return new Map();
  const rows=await db.collection('communityReactions').aggregate([{$match:{kind,targetId:{$in:ids}}},{$group:{_id:{id:'$targetId',reaction:'$reaction'},count:{$sum:1},mine:{$max:{$cond:[{$eq:['$githubId',viewer.githubId]},1,0]}}}}]).toArray();
  const result=new Map();
  for(const row of rows){const entry=result.get(row._id.id)||{likes:0,liked:false,reaction:null,reactions:{}};entry.likes+=row.count;entry.reactions[row._id.reaction]=row.count;if(row.mine){entry.liked=true;entry.reaction=row._id.reaction;}result.set(row._id.id,entry);}
  return result;
}
async function requireTarget(db,user,kind,targetId) {
  if(typeof targetId!=='string'||targetId.length>200)throw fail('Mensagem indisponível.',404);
  if(kind==='chat') {
    if(!/^[a-f0-9]{24}$/.test(targetId))throw fail('Mensagem indisponível.',404);
    const message=await db.collection('communityMessages').findOne({_id:new ObjectId(targetId),deletedAt:{$exists:false}});
    if(message)await require('./safety').requireVisible(db,user,message.githubId);
    if(!message)throw fail('Mensagem indisponível.',404);
    await require('./social').channelFor(db,user,message.channel||'general');return message;
  }
  if(!['comment','help-comment'].includes(kind))throw fail('Tipo de reação inválido.');
  const message=await db.collection(kind==='comment'?'communityComments':'communityHelpComments').findOne({_id:targetId,deletedAt:{$exists:false}});
  if(message)await require('./safety').requireVisible(db,user,message.githubId);
  if(!message)throw fail('Comentário indisponível.',404);
  const parent=await db.collection(kind==='comment'?'communityPosts':'communityGroups').findOne({_id:new ObjectId(kind==='comment'?message.postId:message.helpId),...(kind==='comment'?{deletedAt:{$exists:false}}:{type:'help'})});
  if(parent)await require('./safety').requireVisible(db,user,kind==='comment'?parent.githubId:parent.owner);
  if(!parent)throw fail('Conteúdo indisponível.',404);return message;
}
async function react(db,user,input) {
  const {kind,targetId,reaction}=input;
  if(reaction!==null&&!REACTIONS.includes(reaction))throw fail('Reação inválida.');
  await requireTarget(db,user,kind,targetId);
  const key=`${kind}:${targetId}:${user.githubId}`;
  if(reaction===null)await db.collection('communityReactions').deleteOne({_id:key});
  else await db.collection('communityReactions').updateOne({_id:key},{$set:{reaction},$setOnInsert:{kind,targetId,githubId:user.githubId}},{upsert:true});
  return (await reactionSummaries(db,kind,[targetId],user)).get(targetId)||{likes:0,liked:false,reaction:null,reactions:{}};
}
module.exports={REACTIONS,reactionSummaries,react};
