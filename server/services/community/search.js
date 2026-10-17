async function searchCommunity(db,user,query) {
  if(typeof query.q!=='string'||query.q.trim().length<2||query.q.trim().length>80)throw Object.assign(new Error('Digite de 2 a 80 caracteres.'),{status:400});
  const term=query.q.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match={$regex:term,$options:'i'};
  const [users,groups,posts,help]=await Promise.all([
    db.collection('users').find({communityOptIn:true,$or:[{githubLogin:match},{name:match}]},{projection:{githubId:1,githubLogin:1,picture:1}}).limit(5).toArray(),
    db.collection('communityGroups').find({members:user.githubId,$or:[{name:match},{description:match}]},{projection:{name:1}}).limit(5).toArray(),
    db.collection('communityPosts').find({deletedAt:{$exists:false},text:match},{projection:{text:1}}).sort({_id:-1}).limit(5).toArray(),
    db.collection('communityGroups').find({type:'help',$or:[{name:match},{description:match}]},{projection:{name:1,helpStatus:1}}).sort({_id:-1}).limit(5).toArray()
  ]);
  return {results:[...users.map(r=>({id:`u:${r.githubId}`,type:'Usuário',label:`@${r.githubLogin}`,path:`#profile/${r.githubId}`})),...groups.map(r=>({id:`g:${r._id}`,type:'Grupo',label:r.name,path:`#community/groups/${r._id}`})),...posts.map(r=>({id:`p:${r._id}`,type:'Publicação',label:r.text.slice(0,100),path:`#community/post/${r._id}`})),...help.map(r=>({id:`h:${r._id}`,type:'Pedido de ajuda',label:r.name,path:`#community/help/${r._id}`}))]};
}
module.exports={searchCommunity};
