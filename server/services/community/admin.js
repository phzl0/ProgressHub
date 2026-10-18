const {ObjectId}=require('mongodb');
const crypto=require('crypto');
const {requireStaff,roleFor,suspensionFor}=require('./permissions');
const {boundedText}=require('./text-limits');
const {notify}=require('./notifications');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const TYPES={post:'communityPosts',comment:'communityComments','help-comment':'communityHelpComments',message:'communityMessages',help:'communityGroups'};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
function contentKey(type,value){if(!TYPES[type]||typeof value!=='string'||value.length>200)throw fail('Conteúdo inválido.');if(['post','message','help'].includes(type)){if(!hex(value))throw fail('Conteúdo inválido.');return new ObjectId(value);}return value;}
const revision=row=>row?.moderationRevision||null;
function auditView(r){return {id:r._id,action:r.command.action,actor:r.actorLogin,role:r.actorRole,targetId:r.command.targetId||null,targetType:r.command.targetType||null,reason:r.command.reason,status:r.status,createdAt:r.createdAt,before:r.before,after:r.after};}
function reportView(r,detail=false){return {id:r._id.toHexString(),type:r.targetType,targetId:r.targetId,authorId:r.authorId,label:r.label,reason:r.reason,status:r.status,createdAt:r.createdAt,revision:revision(r),...(detail?{note:r.note,excerpt:r.excerpt,attachment:r.attachment||null,contextId:r.contextId,resolution:r.resolution||null}:{})};}
async function readAdmin(db,user,q={}){
 const staff=await requireStaff(db,user);const view=q.view||'reports';
 if(view==='access')return {role:staff.staffRole};
 if(view==='report'){
  if(!hex(q.id))throw fail('Denúncia indisponível.',404);const r=await db.collection('communityReports').findOne({_id:new ObjectId(q.id)});if(!r)throw fail('Denúncia indisponível.',404);
  const author=await db.collection('users').findOne({githubId:r.authorId},{projection:{githubId:1,githubLogin:1,communityRole:1,communitySuspension:1,moderationRevision:1}});
  let content=null;if(TYPES[r.targetType]){const row=await db.collection(TYPES[r.targetType]).findOne({_id:contentKey(r.targetType,r.targetId)});if(row)content={hidden:Boolean(row.moderationHidden),deleted:Boolean(row.deletedAt),revision:revision(row),text:String(row.text||row.description||'').slice(0,2000)};}
  return {report:reportView(r,true),content,author:author?{githubId:author.githubId,login:author.githubLogin,role:roleFor(author),suspension:suspensionFor(author),revision:revision(author)}:null};
 }
 const filter={};if(q.before){if(!hex(q.before))throw fail('Página inválida.');filter._id={$lt:new ObjectId(q.before)};}
 if(view==='reports'){
  if(q.status&&q.status!=='all'){if(!['received','reviewing','resolved','dismissed'].includes(q.status))throw fail('Estado inválido.');filter.status=q.status;}
  const rows=await db.collection('communityReports').find(filter).sort({_id:-1}).limit(21).toArray();return {role:staff.staffRole,items:rows.slice(0,20).map(r=>reportView(r)),hasMore:rows.length>20};
 }
 if(view==='audit'){
  // Audit ids are stable request keys; pagination uses a separate chronological ObjectId.
  const cursor={};if(q.before)cursor.sequence={$lt:new ObjectId(q.before)};
  const rows=await db.collection('communityAdminAudit').find(cursor).sort({sequence:-1}).limit(31).toArray();return {items:rows.slice(0,30).map(r=>({...auditView(r),cursor:r.sequence.toHexString()})),hasMore:rows.length>30};
 }
 if(view==='users'){
  const login=boundedText(q.q||'',39,1,true).replace(/^@/,'');if(!/^[a-zA-Z0-9-]{2,39}$/.test(login))throw fail('Pesquise pelo usuário GitHub, com pelo menos 2 caracteres.');
  const rows=await db.collection('users').find({githubId:{$exists:true},githubLogin:{$regex:login,$options:'i'}},{projection:{githubId:1,githubLogin:1,communityRole:1,communitySuspension:1,moderationRevision:1}}).limit(20).toArray();return {items:rows.map(r=>({githubId:r.githubId,login:r.githubLogin,role:roleFor(r),suspension:suspensionFor(r),revision:revision(r)}))};
 }
 throw fail('Consulta inválida.');
}
function commandFor(input){
 if(!input||!['report-status','hide','restore','warn','suspend','unsuspend','announce'].includes(input.action))throw fail('Ação inválida.');
 if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))throw fail('Tentativa inválida.');
 const reason=boundedText(input.reason,600,6);if(reason.length<5)throw fail('Explique a justificativa em pelo menos 5 caracteres.');
 const c={action:input.action,reason};
 if(c.action==='announce'){c.title=boundedText(input.title,80,1);c.message=boundedText(input.message,1000,8);return c;}
 if(typeof input.targetId!=='string'||input.targetId.length>200)throw fail('Alvo inválido.');c.targetId=input.targetId;
 if(input.expectedRevision!==null&&(typeof input.expectedRevision!=='string'||input.expectedRevision.length>120))throw fail('Atualize os dados antes de continuar.',409);c.expectedRevision=input.expectedRevision;
 if(['hide','restore'].includes(c.action)){contentKey(input.targetType,c.targetId);c.targetType=input.targetType;}
 else if(c.action==='report-status'){if(!hex(c.targetId)||!['reviewing','resolved','dismissed'].includes(input.status))throw fail('Estado inválido.');c.status=input.status;}
 else {if(!/^\d{1,20}$/.test(c.targetId))throw fail('Usuário inválido.');if(c.action==='suspend'){if(![1,3,7,30].includes(input.days))throw fail('Escolha 1, 3, 7 ou 30 dias.');c.days=input.days;}}
 return c;
}
async function adminAction(db,user,input){
 const staff=await requireStaff(db,user);const command=commandFor(input);const digest=crypto.createHash('sha256').update(JSON.stringify(command)).digest('hex');const key=`${staff.githubId}:${input.requestId}`;const audits=db.collection('communityAdminAudit');let op=await audits.findOne({_id:key});
 if(op&&op.digest!==digest)throw fail('Esta tentativa pertence a outra ação.',409);
 if(op?.status==='completed')return {ok:true,id:key};if(op?.status==='conflict')throw fail('O alvo mudou. Atualize os dados.',409);
 let collection=null,row=null,_id=null;
 if(command.action!=='announce'){
  collection=db.collection(['hide','restore'].includes(command.action)?TYPES[command.targetType]:command.action==='report-status'?'communityReports':'users');
  _id=['hide','restore'].includes(command.action)?contentKey(command.targetType,command.targetId):command.action==='report-status'?new ObjectId(command.targetId):null;
  row=await collection.findOne(_id?{_id}:{githubId:command.targetId});if(!row)throw fail('Alvo indisponível.',404);
  if(['warn','suspend','unsuspend'].includes(command.action)&&(row.githubId===staff.githubId||roleFor(row)))throw fail('Ações sobre contas da equipe não são permitidas neste painel.',403);
  if(['hide','restore'].includes(command.action)&&row.deletedAt)throw fail('Conteúdo excluído não pode ser restaurado.',409);
 }
 if(!op){
  op={_id:key,sequence:new ObjectId(),digest,actorId:staff.githubId,actorLogin:staff.githubLogin,actorRole:staff.staffRole,command,status:'pending',createdAt:new Date(),before:row?{revision:revision(row),...(command.action==='report-status'?{status:row.status}:['hide','restore'].includes(command.action)?{hidden:Boolean(row.moderationHidden)}:{suspension:suspensionFor(row)})}:null};
  try{await audits.insertOne(op);}catch(e){if(e.code!==11000)throw e;return adminAction(db,user,input);}
 }
 let after={};
 if(!['warn','announce'].includes(command.action)){
  const updates={moderationRevision:key};
  if(command.action==='report-status'){updates.status=command.status;updates.resolution={reason:command.reason,at:op.createdAt};after={status:command.status};}
  if(['hide','restore'].includes(command.action)){updates.moderationHidden=command.action==='hide';after={hidden:updates.moderationHidden};}
  if(['suspend','unsuspend'].includes(command.action)){updates.communitySuspension=command.action==='suspend'?{until:new Date(op.createdAt.getTime()+command.days*86400000),reason:command.reason}:null;after={suspension:updates.communitySuspension};}
  const result=await collection.updateOne({_id:row._id,moderationRevision:command.expectedRevision},{$set:updates});
  if(!result.matchedCount){const current=await collection.findOne({_id:row._id});if(current?.moderationRevision!==key){await audits.updateOne({_id:key,status:'pending'},{$set:{status:'conflict'}});throw fail('O alvo mudou. Atualize os dados antes de agir.',409);}}
 }
 if(command.action==='warn')await notify(db,command.targetId,`admin:${key}`,'Advertência da moderação',command.reason,'#settings');
 if(['suspend','unsuspend'].includes(command.action))await notify(db,command.targetId,`admin:${key}`,command.action==='suspend'?'Participação suspensa':'Participação reativada',command.reason,'#settings');
 if(command.action==='announce')await notify(db,'*',`admin:${key}`,command.title,command.message,'#community');
 await audits.updateOne({_id:key,status:'pending'},{$set:{status:'completed',after,completedAt:new Date()}});return {ok:true,id:key};
}
module.exports={readAdmin,adminAction,commandFor};
