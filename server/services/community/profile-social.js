const {blockedIds,requireVisible}=require('./safety');
const {objectId,fail}=require('./expansion-utils');
const {readFeed}=require('./social');
async function readProfileSocial(db,user={},q={}){
 if(typeof q.githubId!=='string'||!/^\d{1,20}$/.test(q.githubId))throw fail('Perfil indisponível.',404);
 const person=await db.collection('users').findOne({githubId:q.githubId,...(user.githubId===q.githubId?{}:{communityOptIn:true})},{projection:{githubId:1}});if(!person)throw fail('Perfil indisponível.',404);if(user.githubId)await requireVisible(db,user,q.githubId);
 const hidden=await blockedIds(db,user);const filter={githubId:q.githubId,deletedAt:{$exists:false},moderationHidden:{$ne:true},projectModerationHidden:{$ne:true},requestKey:{$not:/^project-update:/}};
 if(q.before)filter._id={$lt:objectId(q.before)};const limit=q.limit==='20'?20:4;
 const [rows,followers,following]=await Promise.all([db.collection('communityPosts').find(filter,{projection:{text:1,image:1,kind:1,createdAt:1}}).sort({_id:-1}).limit(limit+1).toArray(),db.collection('communityUserFollows').countDocuments({targetId:q.githubId,githubId:{$nin:hidden}}),db.collection('communityUserFollows').countDocuments({githubId:q.githubId,targetId:{$nin:hidden}})]);
 return {followers,following,posts:rows.slice(0,limit).map(p=>({id:String(p._id),text:p.text,image:p.image||'',kind:p.kind||'feed',createdAt:p.createdAt})),hasMore:rows.length>limit};
}
async function readHomePosts(db,user={}){const data=await readFeed(db,user,{manualOnly:true});return {posts:data.posts.sort((a,b)=>(b.likes+b.commentCount)-(a.likes+a.commentCount)||b.id.localeCompare(a.id)).slice(0,4)};}
module.exports={readProfileSocial,readHomePosts};
