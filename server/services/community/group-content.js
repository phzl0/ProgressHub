const {ObjectId}=require('mongodb');
const {channelFor}=require('./social');const {blockedIds}=require('./safety');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function readGroupContent(db,user,q={}){
 if(typeof q.id!=='string'||!/^[a-f0-9]{24}$/.test(q.id))throw fail('Grupo indisponível.',404);const channel=await channelFor(db,user,`group:${q.id}`);const view=q.view||'media';if(!['media','files','links','search'].includes(view))throw fail('Consulta inválida.');
 const hidden=await blockedIds(db,user);const filter={channel,githubId:{$nin:hidden},deletedAt:{$exists:false},moderationHidden:{$ne:true}};
 if(q.before){if(typeof q.before!=='string'||!/^[a-f0-9]{24}$/.test(q.before))throw fail('Página inválida.');filter._id={$lt:new ObjectId(q.before)};}
 if(view==='search'){if(typeof q.q!=='string'||q.q.trim().length<2||q.q.length>80)throw fail('Pesquise de 2 a 80 caracteres.');filter.text={$regex:escape(q.q.trim()),$options:'i'};}
 if(view==='media')filter['attachment.type']={$regex:'^image/'};
 if(view==='files')filter.$and=[{'attachment.id':{$exists:true}},{'attachment.type':{$not:{$regex:'^image/'}}}];
 if(view==='links')filter.text={$regex:'https?://',$options:'i'};
 const rows=await db.collection('communityMessages').find(filter,{projection:{text:1,createdAt:1,attachment:1,githubId:1}}).sort({_id:-1}).limit(21).toArray();
 const users=await db.collection('users').find({githubId:{$in:rows.map(r=>r.githubId)}},{projection:{githubId:1,githubLogin:1}}).toArray();
 return {items:rows.slice(0,20).map(r=>({id:r._id.toHexString(),text:r.text,createdAt:r.createdAt,login:users.find(u=>u.githubId===r.githubId)?.githubLogin||'Participante',attachment:r.attachment||null,links:(r.text?.match(/https?:\/\/[^\s<>"']+/gi)||[]).slice(0,10)})),hasMore:rows.length>20,nextCursor:rows.length>20?rows[19]._id.toHexString():null};
}
module.exports={readGroupContent};
