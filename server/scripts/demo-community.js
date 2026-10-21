// Explicit local demo setup. No OAuth identity or credentials are fabricated.
const {ObjectId}=require('mongodb');
const {periodFor,progression}=require('../services/github/scoring');
const {ensurePool}=require('../services/community/pool');
const MARK='progress-hub-demo-v1';
const people=[['900000000000001','demo-ana','Ana · Demonstração','JavaScript','Loja de equipamentos'],['900000000000002','demo-bruno','Bruno · Demonstração','Python','Painel financeiro'],['900000000000003','demo-carla','Carla · Demonstração','Java','Gestão de estoque'],['900000000000004','demo-diego','Diego · Demonstração','TypeScript','Agenda de serviços'],['900000000000005','demo-elisa','Elisa · Demonstração','Go','API de pagamentos']];
async function seedDemo(db,now=new Date()){
 const pool=await ensurePool(db,now);const period=periodFor(now);const begin=new Date(pool.startsAt);const data={demoFixture:MARK};
 for(let i=0;i<people.length;i++){
  const [githubId,login,name,language,title]=people[i];const xp=1000+i*650;const stats={period,xp,...progression(xp),commits:10+i*4,mergedPRs:2+i,achievements:[],syncedAt:now};
  const picture=`/demo-users/avatar-${i+1}.svg`;
  const collision=await db.collection('users').findOne({githubId,demoFixture:{$ne:MARK}});if(collision)throw new Error('ID de demonstração já está ocupado; nenhum usuário real será alterado.');
  await db.collection('users').updateOne({githubId},{$setOnInsert:{...data,githubId,githubLogin:login,name,picture,communityOptIn:true,communityParticipation:[{from:begin,to:null}],missionsStartedAt:begin,githubStats:stats,communityProfile:{bio:'Perfil fictício para testar a comunidade. Nenhuma atividade representa contribuições reais.',description:'Conta de demonstração',links:[],projects:[]}}},{upsert:true});
  await db.collection('users').updateOne({githubId,demoFixture:MARK,'githubStats.period':{$ne:period}},{$set:{githubStats:stats}});
  await db.collection('communitySeasons').updateOne({githubId,period},{$setOnInsert:{...data,githubId,period,status:'open',eligible:true,stats,createdAt:now}},{upsert:true});
  const key=`${MARK}:project:${i}`;await db.collection('communityProjects').updateOne({requestKey:key},{$setOnInsert:{...data,requestKey:key,title:`${title} · Demo`,description:`Projeto fictício em ${language}, com etapas para explorar a plataforma.`,repository:'https://github.com/phzl0/QuestLog',language,tags:[language.toLowerCase()],steps:[{id:'1',label:'Definir estrutura',done:true},{id:'2',label:'Implementar funcionalidades',done:i%2===0},{id:'3',label:'Testar e documentar',done:false}],roles:['frontend','backend','testing'],owner:githubId,members:[githubId],status:'active',version:1,createdAt:new Date(+now-i*60000)}},{upsert:true});
  const project=await db.collection('communityProjects').findOne({requestKey:key});const projectId=String(project._id);
  await db.collection('communityPosts').updateOne({requestKey:`${MARK}:post:${i}`},{$setOnInsert:{...data,requestKey:`${MARK}:post:${i}`,githubId,text:`[Demonstração] Avancei no ${title.toLowerCase()}! Qual funcionalidade você criaria primeiro?`,image:'',kind:'project',projectId,projectOwner:githubId,tags:[language.toLowerCase()],createdAt:new Date(+now-i*300000)}},{upsert:true});
  const post=await db.collection('communityPosts').findOne({requestKey:`${MARK}:post:${i}`});
  for(let j=0;j<people.length;j++)if(j!==i){const other=people[j][0];await db.collection('communityProjectReactions').updateOne({_id:`${projectId}:${other}`},{$setOnInsert:{...data,projectId,githubId:other,liked:true,favorite:j%2===0}},{upsert:true});await db.collection('communityLikes').updateOne({_id:`${post._id}:${other}`},{$setOnInsert:{...data,postId:String(post._id),githubId:other,reaction:j%2?'heart':'like'}},{upsert:true});}
  await db.collection('communityComments').updateOne({requestKey:`${MARK}:comment:${i}`},{$setOnInsert:{...data,requestKey:`${MARK}:comment:${i}`,postId:String(post._id),githubId:people[(i+1)%5][0],text:'[Demo] Gostei da ideia! Eu começaria pelos testes da funcionalidade principal.',createdAt:now}},{upsert:true});
  for(let n=0;n<i+2;n++){const at=new Date(Math.min(+now,+begin+n*1000));await db.collection('missionEvents').updateOne({_id:`${MARK}:commit:${i}:${period}:${n}`},{$setOnInsert:{...data,githubId,kind:'commit',id:`demo-${i}-${period}-${n}`,at:at.toISOString(),confirmedAt:now}},{upsert:true});}
  const user=await db.collection('users').findOne({githubId});const help=await require('../services/community/help').helpAction(db,user,{action:'create',requestId:`demo-help-request-${i}`,title:`[Demo] Como testar ${title.toLowerCase()}?`,description:'Pedido fictício: quero sugestões para organizar os primeiros testes.',category:'testing',tags:[language.toLowerCase()],limit:6});
  await db.collection('communityGroups').updateOne({_id:new ObjectId(help.id)},{$set:data});
  await db.collection('communityMessages').updateOne({requestKey:`${MARK}:chat:${i}`},{$setOnInsert:{...data,requestKey:`${MARK}:chat:${i}`,githubId,channel:'general',text:`[Demonstração] Olá! Estou construindo ${title.toLowerCase()} em ${language}.`,createdAt:new Date(+now-i*60000)}},{upsert:true});
 }
 return {users:5,message:'Demonstração criada. Os cinco perfis participam dos rankings.'};
}
async function removeDemo(db){
 const ids=people.map(p=>p[0]);const projects=await db.collection('communityProjects').find({demoFixture:MARK},{projection:{_id:1}}).toArray();const posts=await db.collection('communityPosts').find({demoFixture:MARK},{projection:{_id:1}}).toArray();const projectIds=projects.map(p=>String(p._id)),postIds=posts.map(p=>String(p._id));
 for(const {name} of await db.listCollections().toArray()){
  const filter={$or:[{demoFixture:MARK}]};if(name.startsWith('community')||name==='missionEvents')filter.$or.push({githubId:{$in:ids}},{owner:{$in:ids}},{recipient:{$in:ids}},{actorId:{$in:ids}},{projectId:{$in:projectIds}},{postId:{$in:postIds}});
  await db.collection(name).deleteMany(filter);
 }
 // Remove references to demo accounts from real users' collections without deleting those users.
 await db.collection('communityGroups').updateMany({},{$pull:{members:{$in:ids},invited:{$in:ids},joinRequests:{$in:ids},helpers:{$in:ids}}});
 await db.collection('communityUserFollows').deleteMany({targetId:{$in:ids}});await db.collection('communityContacts').deleteMany({$or:[{from:{$in:ids}},{to:{$in:ids}}]});
 return {message:'Dados de demonstração removidos; usuários reais preservados.'};
}
if(require.main===module)(async()=>{require('dotenv').config();if(!['seed','remove'].includes(process.argv[2]))throw new Error('Use: node scripts/demo-community.js seed | remove');const {connectToDatabase,initializeIndexes,closeDatabase}=require('../db');await initializeIndexes();const db=await connectToDatabase();console.log(await (process.argv[2]==='seed'?seedDemo(db):removeDemo(db)));process.exit(0);})().catch(e=>{console.error(e.message);process.exit(1)});
module.exports={seedDemo,removeDemo,MARK,people};
