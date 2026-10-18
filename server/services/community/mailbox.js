const {canAnnounce}=require('./notifications');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function notificationScope(db,user){
 const [blocks,mutes]=await Promise.all([db.collection('communityBlocks').find({githubId:user.githubId}).toArray(),db.collection('communityGroupMutes').find({githubId:user.githubId}).toArray()]);
 const personal={recipient:user.githubId,actorId:{$nin:blocks.map(r=>r.blockedId)},groupId:{$nin:mutes.map(r=>r.groupId)}};
 const logins=blocks.map(r=>r.login).filter(Boolean);if(logins.length)personal.message={$not:{$regex:`^@(?:${logins.map(escape).join('|')})(?:\\s|$)`,$options:'i'}};
 if(mutes.length)personal.path={$not:{$regex:`^#community/(?:groups|help)/(?:${mutes.map(r=>r.groupId).join('|')})(?:[?]|$)`}};
 return {$or:[personal,{recipient:'*'}]};
}
function cursorFor(row){return Buffer.from(JSON.stringify({at:row.createdAt,id:String(row._id)})).toString('base64url');}
function parseCursor(value){try{if(typeof value!=='string'||value.length>1200)throw Error();const c=JSON.parse(Buffer.from(value,'base64url'));if(typeof c.id!=='string'||c.id.length>300||typeof c.at!=='string'||!Number.isFinite(new Date(c.at).getTime()))throw Error();return {at:new Date(c.at),id:c.id};}catch(_){throw fail('Página inválida.');}}
async function readMailbox(db,user,q={}){
 const folder=q.folder||'inbox';if(!['inbox','all','unread','starred','archive'].includes(folder))throw fail('Pasta inválida.');
 if(q.id!==undefined&&(typeof q.id!=='string'||!q.id||q.id.length>300))throw fail('Mensagem indisponível.',404);
 const [fresh,scope]=await Promise.all([db.collection('users').findOne({githubId:user.githubId},{projection:{communityInboxReadAt:1,communityRole:1,githubId:1}}),notificationScope(db,user)]);const since=fresh?.communityInboxReadAt||new Date(0);
 const base=[{$match:scope},{$lookup:{from:'communityInboxState',let:{id:'$_id'},pipeline:[{$match:{$expr:{$and:[{$eq:['$notificationId','$$id']},{$eq:['$githubId',user.githubId]}]}}}],as:'state'}},{$set:{state:{$arrayElemAt:['$state',0]}}},{$set:{unread:{$ifNull:['$state.unread',{$gt:['$createdAt',since]}]},starred:{$ifNull:['$state.starred',false]},archived:{$ifNull:['$state.archived',false]}}}];
 const page=[];if(q.id)page.push({$match:{_id:q.id}});else{const filter=folder==='archive'?{archived:true}:folder==='all'?{}:folder==='starred'?{starred:true}:{archived:false,...(folder==='unread'?{unread:true}:{})};page.push({$match:filter});if(q.before){const c=parseCursor(q.before);page.push({$match:{$or:[{createdAt:{$lt:c.at}},{createdAt:c.at,_id:{$lt:c.id}}]}});}}
 const result=await db.collection('communityNotifications').aggregate([...base,{$facet:{items:[...page,{$sort:{createdAt:-1,_id:-1}},{$limit:q.id?1:31},{$project:{state:0,recipient:0,actorId:0,groupId:0}}],count:[{$match:{unread:true,archived:false}},{$count:'total'}]}}]).toArray();const rows=result[0]?.items||[];
 if(q.id&&!rows.length)throw fail('Mensagem indisponível.',404);
 return {items:rows.slice(0,30).map(r=>({id:String(r._id),title:r.title,message:r.message,path:r.path,createdAt:r.createdAt,unread:r.unread,starred:r.starred,archived:r.archived})),hasMore:!q.id&&rows.length>30,nextCursor:rows.length>30?cursorFor(rows[29]):null,unread:result[0]?.count[0]?.total||0,canAnnounce:canAnnounce(fresh||user),checkedAt:new Date()};
}
async function changeMessage(db,user,input){
 const fields={'set-read':'unread',star:'starred',archive:'archived'};const field=fields[input.action];if(!field||typeof input.value!=='boolean'||typeof input.id!=='string'||!input.id||input.id.length>300)throw fail('Alteração de mensagem inválida.');
 const scope=await notificationScope(db,user);const row=await db.collection('communityNotifications').findOne({$and:[scope,{_id:input.id}]});if(!row)throw fail('Mensagem indisponível.',404);
 await db.collection('communityInboxState').updateOne({_id:`${user.githubId}:${input.id}`},{$set:{[field]:input.value,updatedAt:new Date()},$setOnInsert:{githubId:user.githubId,notificationId:input.id,notificationAt:row.createdAt}},{upsert:true});return {ok:true};
}
module.exports={readMailbox,changeMessage,notificationScope,parseCursor};
