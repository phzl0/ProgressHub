const crypto=require('crypto');
const {ObjectId}=require('mongodb');
const {boundedText}=require('./text-limits');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function objectId(value){if(typeof value!=='string'||!/^[a-f0-9]{24}$/.test(value))throw fail('Item indisponível.',404);return new ObjectId(value);}
function requestKey(user,input,prefix){if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))throw fail('Tentativa inválida.');return `${prefix}:${user.githubId}:${input.requestId}`;}
function tags(value=[]){if(!Array.isArray(value)||value.length>5)throw fail('Escolha até cinco tecnologias.');return [...new Set(value.map(t=>{const s=boundedText(t,24,1).toLowerCase();if(!/^[a-z0-9#+. -]+$/.test(s))throw fail('Tecnologia inválida.');return s;}))];}
function search(value){if(value===undefined||value==='')return null;const s=boundedText(value,80,1);return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function pageFilter(q,filter={}){if(q.before)filter._id={$lt:objectId(q.before)};return filter;}
async function audit(db,user,input,action,targetId,now=new Date()){
 const reason=boundedText(input.reason,600,6);if(reason.length<5)throw fail('Informe uma justificativa com pelo menos cinco caracteres.');
 const key=requestKey(user,input,'expansion');const digest=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');const previous=await db.collection('communityAdminAudit').findOne({_id:key});if(previous&&previous.digest!==digest)throw fail('Esta tentativa pertence a outra ação.',409);
 await db.collection('communityAdminAudit').updateOne({_id:key},{$setOnInsert:{digest,sequence:new ObjectId(),actorId:user.githubId,actorLogin:user.githubLogin,actorRole:user.staffRole,command:{action,reason,targetId},status:'pending',createdAt:now}},{upsert:true});return key;
}
async function finishAudit(db,key){await db.collection('communityAdminAudit').updateOne({_id:key},{$set:{status:'completed',completedAt:new Date()}});}
module.exports={fail,objectId,requestKey,tags,search,pageFilter,audit,finishAudit};
