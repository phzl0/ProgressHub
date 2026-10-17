const { ObjectId } = require('mongodb');
const { appearanceFor } = require('./cosmetics');
const { reactionSummaries } = require('./reactions');
const fail = (message,status=400) => Object.assign(new Error(message),{status});
async function readComments(db,user,query) {
  const isHelp=query.helpId!==undefined;const parentId=isHelp?query.helpId:query.postId;
  if(typeof parentId!=='string'||!/^[a-f0-9]{24}$/.test(parentId))throw fail('Conteúdo indisponível.',404);
  if(!await db.collection(isHelp?'communityGroups':'communityPosts').findOne({_id:new ObjectId(parentId),...(isHelp?{type:'help'}:{deletedAt:{$exists:false}})}))throw fail('Conteúdo indisponível.',404);
  const collection=db.collection(isHelp?'communityHelpComments':'communityComments');const filter=isHelp?{helpId:parentId}:{postId:parentId};
  if(query.before){
    if(typeof query.before!=='string'||query.before.length>200)throw fail('Página inválida.');
    const cursor=await collection.findOne({_id:query.before,...filter});
    if(!cursor)throw fail('Atualize os comentários para continuar.',409);
    filter.$or=[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}];
  }
  const rows=await collection.find(filter).sort({createdAt:-1,_id:-1}).limit(31).toArray();
  const authors=await db.collection('users').find({githubId:{$in:rows.map(r=>r.githubId)}},{projection:{githubId:1,githubLogin:1,picture:1,communityOptIn:1,communityAppearance:1}}).toArray();
  const reactions=await reactionSummaries(db,isHelp?'help-comment':'comment',rows.map(r=>String(r._id)),user);
  return {comments:rows.slice(0,30).map(r=>{const a=authors.find(a=>a.githubId===r.githubId);return {...(reactions.get(String(r._id))||{likes:0,liked:false,reaction:null,reactions:{}}),id:String(r._id),text:r.text,createdAt:r.createdAt,own:r.githubId===user.githubId,author:{login:a?.githubLogin||'Participante',picture:a?.picture||'',profileId:a?.communityOptIn?a.githubId:null,appearance:appearanceFor(a||{})}};}),hasMore:rows.length>30};
}
module.exports={readComments};
