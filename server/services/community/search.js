const {blockedIds}=require('./safety');
const {ACHIEVEMENTS}=require('./achievements');
const {tokensFor,scoreEntry,catalogSearch,normalize}=require('./search-catalog');
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const accents={a:'[aáàâãä]',e:'[eéèêë]',i:'[iíìîï]',o:'[oóòôõö]',u:'[uúùûü]',c:'[cç]'};
const pattern=value=>[...value].map(c=>accents[c]||escape(c)).join('');
function textFilter(fields,tokens){return {$and:tokens.map(token=>({$or:fields.map(field=>({[field]:{$regex:pattern(token),$options:'i'}}))}))};}
const intents={users:['usuario','usuarios','pessoa','pessoas','perfil'],groups:['grupo','grupos','equipe'],posts:['post','posts','publicacao','publicacoes','feed'],help:['ajuda','ajudar','duvida','pergunta','pedido']};
function scopedTokens(tokens){const filtered=tokens.filter(t=>!Object.values(intents).flat().includes(t));return filtered.length?filtered:tokens;}
async function searchCommunity(db,user,query){
  if(typeof query.q!=='string'||query.q.trim().length<2||query.q.trim().length>80)throw Object.assign(new Error('Digite de 2 a 80 caracteres.'),{status:400});
  const hidden=await blockedIds(db,user);
  const tokens=tokensFor(query.q);const catalogs=catalogSearch(query.q);
  const achievements=ACHIEVEMENTS.map(a=>({id:`achievement:${a.id}`,type:'Conquista',label:a.name,description:`${a.description} Recompensa: ${a.xp} XP.`,aliases:`conquista conquistas medalha medalhas experiencia exp xp ${a.category} ${a.metric}`,path:`#progress/achievements?achievement=${a.id}`})).map(r=>({...r,score:scoreEntry(r,tokens)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
  const [users,groups,posts,help]=await Promise.all([
    db.collection('users').find({communityOptIn:true,githubId:{$nin:hidden},...textFilter(['githubLogin','name'],scopedTokens(tokens,'users'))},{projection:{githubId:1,githubLogin:1}}).limit(12).toArray(),
    db.collection('communityGroups').find({moderationHidden:{$ne:true},members:user.githubId,...textFilter(['name','description'],scopedTokens(tokens,'groups'))},{projection:{name:1,description:1}}).limit(12).toArray(),
    db.collection('communityPosts').find({deletedAt:{$exists:false},moderationHidden:{$ne:true},githubId:{$nin:hidden},...textFilter(['text'],scopedTokens(tokens,'posts'))},{projection:{text:1}}).sort({_id:-1}).limit(12).toArray(),
    db.collection('communityGroups').find({type:'help',moderationHidden:{$ne:true},owner:{$nin:hidden},...textFilter(['name','description'],scopedTokens(tokens,'help'))},{projection:{name:1,description:1,helpStatus:1}}).sort({_id:-1}).limit(12).toArray()
  ]);
  const rank=(rows,key)=>rows.map(r=>({...r,score:scoreEntry(r,scopedTokens(tokens,key))+(tokens.some(t=>intents[key].includes(t))?40:0)})).sort((a,b)=>b.score-a.score).slice(0,5);
  const results=[...catalogs,...achievements,
    ...rank(users.map(r=>({id:`u:${r.githubId}`,type:'Usuário',label:`@${r.githubLogin}`,path:`#profile/${r.githubId}`})),'users'),
    ...rank(groups.map(r=>({id:`g:${r._id}`,type:'Grupo',label:r.name,description:r.description,path:`#community/groups/${r._id}`})),'groups'),
    ...rank(posts.map(r=>({id:`p:${r._id}`,type:'Publicação',label:r.text.slice(0,100),description:r.text,path:`#community/post/${r._id}`})),'posts'),
    ...rank(help.map(r=>({id:`h:${r._id}`,type:'Pedido de ajuda',label:r.name,description:r.description,path:`#community/help/${r._id}`})),'help')
  ].sort((a,b)=>b.score-a.score).slice(0,20).map(({score,aliases,...entry})=>({...entry,description:entry.description?.slice(0,160)||''}));
  return {results,query:normalize(query.q),suggestion:catalogs[0]?.label||null};
}
module.exports={searchCommunity};
