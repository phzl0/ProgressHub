const {ObjectId}=require('mongodb');
const {appearanceFor}=require('./cosmetics');
const {reactionSummaries}=require('./reactions');
const {boundedText}=require('./text-limits');
const {blockedIds,requireVisible}=require('./safety');
const {notify}=require('./notifications');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function finishReply(db,user,kind,parentId,ctx,row){if(!row.rootId)return;await db.collection(ctx.collection).updateOne({_id:row.rootId,...ctx.scope},{$set:{hasReplies:true}});if(row.replyToGithubId&&row.replyToGithubId!==user.githubId)await notify(db,row.replyToGithubId,`reply:${kind}:${row._id}`,'Responderam seu comentário',`@${user.githubLogin} respondeu ao seu comentário.`,ctx.isHelp?`#community/help/${parentId}?comment=${encodeURIComponent(row.rootId)}`:`#community/post/${parentId}?comment=${encodeURIComponent(row.rootId)}`,{actorId:user.githubId,...(ctx.isHelp?{groupId:parentId}:{})});}
function context(kind,parentId){
  if(!['post','help'].includes(kind)||typeof parentId!=='string'||!/^[a-f0-9]{24}$/.test(parentId))throw fail('Conteúdo indisponível.',404);
  return {isHelp:kind==='help',collection:kind==='help'?'communityHelpComments':'communityComments',scope:kind==='help'?{helpId:parentId}:{postId:parentId}};
}
async function requireParent(db,kind,parentId,user){const ctx=context(kind,parentId);const parent=await db.collection(ctx.isHelp?'communityGroups':'communityPosts').findOne({_id:new ObjectId(parentId),...(ctx.isHelp?{type:'help',moderationHidden:{$ne:true}}:{deletedAt:{$exists:false},moderationHidden:{$ne:true}})});if(!parent)throw fail('Conteúdo indisponível.',404);if(user)await requireVisible(db,user,ctx.isHelp?parent.owner:parent.githubId);return ctx;}
async function addComment(db,user,kind,parentId,input){
  const ctx=await requireParent(db,kind,parentId,user);const collection=db.collection(ctx.collection);const text=boundedText(input.text,600,3);
  if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))throw fail('Comentário inválido.');
  const key=`${user.githubId}:${input.requestId}`;const existing=await collection.findOne({_id:key});
  if(existing){if(existing[ctx.isHelp?'helpId':'postId']!==parentId)throw fail('Esta tentativa pertence a outro conteúdo.',409);await finishReply(db,user,kind,parentId,ctx,existing);return {id:key};}
  let target=null,root=null;
  if(input.replyTo!==undefined&&input.replyTo!==null){
    if(typeof input.replyTo!=='string'||input.replyTo.length>200)throw fail('Comentário indisponível.',404);
    target=await collection.findOne({_id:input.replyTo,...ctx.scope,deletedAt:{$exists:false},moderationHidden:{$ne:true}});
    if(target)await requireVisible(db,user,target.githubId);
    if(!target)throw fail('Este comentário foi excluído ou está indisponível.',404);
    root=target.rootId?await collection.findOne({_id:target.rootId,...ctx.scope}):target;
    if(!root||root.moderationHidden)throw fail('Conversa indisponível.',404);
  }
  const row={_id:key,...ctx.scope,githubId:user.githubId,text,createdAt:new Date(),rootId:root?String(root._id):null,replyTo:target?String(target._id):null,replyToGithubId:target?.githubId||null};
  try{await collection.insertOne(row);}catch(error){if(error.code!==11000)throw error;const stored=await collection.findOne({_id:key});if(!stored||stored[ctx.isHelp?'helpId':'postId']!==parentId)throw fail('Esta tentativa pertence a outro conteúdo.',409);await finishReply(db,user,kind,parentId,ctx,stored);return {id:key};}
  await finishReply(db,user,kind,parentId,ctx,row);
  return {id:key};
}
async function deleteComment(db,user,kind,parentId,commentId){
  const ctx=await requireParent(db,kind,parentId,user);
  if(typeof commentId!=='string'||commentId.length>200)throw fail('Comentário indisponível.',404);
  const result=await db.collection(ctx.collection).updateOne({_id:commentId,...ctx.scope,githubId:user.githubId},{$set:{deletedAt:new Date()},$unset:{text:''}});
  if(!result.matchedCount)throw fail('Comentário indisponível.',404);return {id:commentId};
}
async function present(db,user,ctx,rows){
  const ids=[...new Set(rows.flatMap(r=>[r.githubId,r.replyToGithubId].filter(Boolean)))];
  const authors=await db.collection('users').find({githubId:{$in:ids}},{projection:{githubId:1,githubLogin:1,picture:1,communityOptIn:1,communityAppearance:1}}).toArray();
  const reactions=await reactionSummaries(db,ctx.isHelp?'help-comment':'comment',rows.filter(r=>!r.deletedAt).map(r=>String(r._id)),user);
  return rows.map(r=>{const a=authors.find(a=>a.githubId===r.githubId);return {...(reactions.get(String(r._id))||{likes:0,liked:false,reaction:null,reactions:{}}),id:String(r._id),text:r.deletedAt?'':r.text,deleted:Boolean(r.deletedAt),createdAt:r.createdAt,rootId:r.rootId||null,replyTo:r.replyTo||null,replyToAuthor:r.replyToGithubId?authors.find(a=>a.githubId===r.replyToGithubId)?.githubLogin||'Participante':null,own:r.githubId===user.githubId,author:{githubId:r.githubId,login:a?.githubLogin||'Participante',picture:a?.picture||'',profileId:a?.communityOptIn?a.githubId:null,appearance:appearanceFor(a||{})}};});
}
async function readComments(db,user,query){
  const kind=query.helpId!==undefined?'help':'post';const parentId=kind==='help'?query.helpId:query.postId;
  const ctx=await requireParent(db,kind,parentId,user);const collection=db.collection(ctx.collection);const hidden=await blockedIds(db,user);const filter={...ctx.scope,moderationHidden:{$ne:true},githubId:{$nin:hidden}};
  if(query.threadId!==undefined){
    if(typeof query.threadId!=='string'||query.threadId.length>200)throw fail('Conversa inválida.');
    const root=await collection.findOne({_id:query.threadId,...ctx.scope});if(root)await requireVisible(db,user,root.githubId);if(!root||root.rootId||root.moderationHidden)throw fail('Conversa indisponível.',404);filter.rootId=query.threadId;
  }else filter.$and=[{$or:[{rootId:{$exists:false}},{rootId:null}]},{$or:[{deletedAt:{$exists:false},moderationHidden:{$ne:true}},{hasReplies:true}]}];
  if(query.commentId!==undefined){if(typeof query.commentId!=='string'||query.commentId.length>200||query.threadId||query.before)throw fail('Comentário inválido.');filter._id=query.commentId;}
  if(query.before){
    if(typeof query.before!=='string'||query.before.length>200)throw fail('Página inválida.');
    const cursor=await collection.findOne({_id:query.before,...filter});if(!cursor)throw fail('Atualize os comentários para continuar.',409);
    filter.$or=[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}];
  }
  const rows=await collection.find(filter).sort({createdAt:-1,_id:-1}).limit(31).toArray();const page=rows.slice(0,30);const comments=await present(db,user,ctx,page);
  if(!query.threadId&&page.length){
    const replyGroups=await collection.aggregate([{$match:{...ctx.scope,githubId:{$nin:hidden},rootId:{$in:page.map(r=>String(r._id))},deletedAt:{$exists:false},moderationHidden:{$ne:true}}},{$group:{_id:'$rootId',count:{$sum:1},rows:{$topN:{sortBy:{createdAt:-1,_id:-1},output:'$$ROOT',n:10}}}}]).toArray();
    const replies=await present(db,user,ctx,replyGroups.flatMap(g=>g.rows));
    for(const comment of comments){const group=replyGroups.find(g=>g._id===comment.id);comment.replies=replies.filter(r=>r.rootId===comment.id).reverse();comment.replyCount=group?.count||0;comment.replyHasMore=comment.replyCount>10;}
  }
  return {comments,hasMore:rows.length>30};
}
module.exports={readComments,addComment,deleteComment};
