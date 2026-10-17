const { ObjectId } = require('mongodb');
const { appearanceFor } = require('./cosmetics');
const fail = (message,status=400) => Object.assign(new Error(message),{status});
async function readComments(db,user,query) {
  if (typeof query.postId !== 'string' || !/^[a-f0-9]{24}$/.test(query.postId)) throw fail('Publicação indisponível.',404);
  if (!await db.collection('communityPosts').findOne({_id:new ObjectId(query.postId),deletedAt:{$exists:false}})) throw fail('Publicação indisponível.',404);
  const filter={postId:query.postId};
  if (query.before) {
    if (typeof query.before !== 'string' || query.before.length>200) throw fail('Página inválida.');
    const cursor=await db.collection('communityComments').findOne({_id:query.before,postId:query.postId});
    if (!cursor) throw fail('Atualize os comentários para continuar.',409);
    filter.$or=[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}];
  }
  const rows=await db.collection('communityComments').find(filter).sort({createdAt:-1,_id:-1}).limit(31).toArray();
  const authors=await db.collection('users').find({githubId:{$in:rows.map(r=>r.githubId)}},{projection:{githubId:1,githubLogin:1,picture:1,communityOptIn:1,communityAppearance:1}}).toArray();
  return { comments:rows.slice(0,30).map(r=>{const a=authors.find(a=>a.githubId===r.githubId);return {id:String(r._id),text:r.text,createdAt:r.createdAt,own:r.githubId===user.githubId,author:{login:a?.githubLogin||'Participante',picture:a?.picture||'',profileId:a?.communityOptIn?a.githubId:null,appearance:appearanceFor(a||{})}};}),hasMore:rows.length>30 };
}
module.exports={readComments};
