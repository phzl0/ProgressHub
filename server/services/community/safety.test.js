const test=require('node:test');const assert=require('node:assert/strict');const {MongoClient,ObjectId}=require('mongodb');
const {safetyAction,readSafety}=require('./safety');const {socialAction,readSocial,feedAction,readFeed}=require('./social');const {readComments,addComment}=require('./comments');const {readChat,sendMessage}=require('./chat');const {readFile,uploadFile}=require('./attachments');const {readInbox,notify}=require('./notifications');const {searchCommunity}=require('./search');const {react}=require('./reactions');
test('safety rejects malformed actions and identifiers before database access',async()=>{
  const user={githubId:'1'};
  await assert.rejects(safetyAction({},user,{action:'mute-group',groupId:'bad'}),{status:404});
  for(const input of [{action:'block',githubId:'1'},{action:'block',githubId:{$ne:null}},{action:'report',reason:'fake'},{action:'report',reason:'spam',requestId:'bad'},{action:'ban',githubId:'2'}])await assert.rejects(safetyAction({},user,input),{status:400});
});
test('MongoDB: reports stay private, blocks hide direct content and invites, mutes suppress group notices without XP changes',{skip:!process.env.MONGODB_TEST_URI},async()=>{
  const client=await MongoClient.connect(process.env.MONGODB_TEST_URI);const db=client.db(`safety_${new ObjectId()}`);
  const alice={_id:new ObjectId(),githubId:'1',githubLogin:'alice',communityOptIn:true,githubStats:{xp:321},career:{xp:456}};const bob={_id:new ObjectId(),githubId:'2',githubLogin:'bob',communityOptIn:true};const carol={_id:new ObjectId(),githubId:'3',githubLogin:'carol',communityOptIn:true};
  try{
    await db.collection('users').insertMany([alice,bob,carol]);await db.collection('communityReports').createIndex({requestKey:1},{unique:true});await db.collection('communityReports').createIndex({reporterId:1,targetType:1,targetId:1},{unique:true,partialFilterExpression:{status:'received'}});await db.collection('communityPosts').createIndex({requestKey:1},{unique:true});await db.collection('communityMessages').createIndex({requestKey:1},{unique:true});
    await feedAction(db,bob,{action:'publish',text:'Bob constrói um projeto',requestId:'bob-publish-000001'});const post=(await readFeed(db,alice)).posts[0];
    const comment=await addComment(db,bob,'post',post.id,{text:'Comentário de Bob',requestId:'bob-comment-00001'});
    const ownPost=new ObjectId().toHexString();await db.collection('communityPosts').insertOne({_id:new ObjectId(ownPost),githubId:alice.githubId,text:'Meu projeto'});const visibleComment=await addComment(db,bob,'post',ownPost,{text:'Sugestão de Bob',requestId:'bob-comment-00002'});
    await socialAction(db,alice,{action:'group-create',name:'Equipe compartilhada',description:'Grupo de estudos'});const group=(await readSocial(db,alice)).groups[0];const channel=`group:${group.id}`;await db.collection('communityGroups').updateOne({_id:new ObjectId(group.id)},{$addToSet:{members:bob.githubId}});
    const file=await uploadFile(db,bob,{channel,name:'notes.txt'},Buffer.from('arquivo de Bob'));const message=await sendMessage(db,bob,{channel,text:'Mensagem de Bob',attachmentId:file.id,requestId:'bob-message-000001'});
    const report={action:'report',targetType:'message',targetId:message.id,reason:'harassment',note:'Explicação privada',requestId:'report-request-001'};
    const first=await safetyAction(db,alice,report);assert.equal((await safetyAction(db,alice,report)).id,first.id);await safetyAction(db,alice,{...report,requestId:'report-request-002'});assert.equal(await db.collection('communityReports').countDocuments({}),1);
    let state=await readSafety(db,alice);assert.equal(state.reports[0].status,'received');assert.equal(JSON.stringify(state).includes('Explicação privada'),false);assert.equal((await readSafety(db,bob,{reporterId:'1'})).reports.length,0);assert.equal((await readInbox(db,bob)).items.length,0);
    const stored=await db.collection('communityReports').findOne({_id:new ObjectId(first.id)});assert.equal(stored.reporterId,'1');assert.equal(stored.authorId,'2');assert.equal(stored.contextId,group.id);assert.equal(stored.excerpt,'Mensagem de Bob');assert.equal(stored.note,'Explicação privada');
    await assert.rejects(safetyAction(db,carol,{...report,requestId:'outsider-report01'}),{status:403});await assert.rejects(safetyAction(db,bob,{...report,requestId:'self-report-00001'}),{status:400});
    for(const [type,target] of [['post',post.id],['comment',comment.id],['user',bob.githubId]])await safetyAction(db,alice,{action:'report',targetType:type,targetId:target,reason:'spam',requestId:`report-${type}-000001`});
    await socialAction(db,bob,{action:'contact-request',login:'alice'});assert.ok((await readSocial(db,alice)).contacts.length);await safetyAction(db,alice,{action:'block',githubId:bob.githubId});
    assert.equal((await readSocial(db,alice)).contacts.length,0);assert.equal((await readSocial(db,bob)).contacts.length,0);assert.equal((await readFeed(db,alice,{post:post.id})).posts.length,0);
    assert.equal((await readFeed(db,carol,{post:post.id})).posts.length,1);assert.equal((await readComments(db,alice,{postId:ownPost})).comments.length,0);
    await assert.rejects(readComments(db,alice,{postId:post.id}),{status:404});await assert.rejects(readComments(db,alice,{postId:ownPost,threadId:visibleComment.id}),{status:404});await assert.rejects(readFile(db,alice,file.id),{status:404});
    const chat=await readChat(db,alice,{channel,known:message.id});assert.equal(chat.messages.length,0);assert.deepEqual(chat.hiddenIds,[message.id]);assert.equal((await readChat(db,carol,{channel:'general'})).messages.length,0);
    await assert.rejects(react(db,alice,{kind:'chat',targetId:message.id,reaction:'heart'}),{status:404});
    for(const [u,login] of [[alice,'bob'],[bob,'alice']])await assert.rejects(socialAction(db,u,{action:'contact-request',login}),{status:403});
    await db.collection('communityContacts').insertOne({_id:'1:2',from:'1',to:'2',status:'accepted'});await assert.rejects(socialAction(db,alice,{action:'group-invite',id:group.id,githubId:bob.githubId}),{status:403});
    assert.equal((await searchCommunity(db,alice,{q:'Bob'})).results.some(r=>r.type==='Usuário'||r.type==='Publicação'),false);assert.equal((await readInbox(db,alice)).items.some(n=>n.title==='Convite de contato'),false);
    assert.ok((await readSocial(db,alice)).groups.some(g=>g.id===group.id));assert.ok((await readSocial(db,bob)).groups.some(g=>g.id===group.id));
    await safetyAction(db,alice,{action:'unblock',githubId:bob.githubId});assert.equal((await readFeed(db,alice,{post:post.id})).posts.length,1);assert.equal((await readFile(db,alice,file.id)).name,'notes.txt');
    await notify(db,alice.githubId,'old-group','Aviso antigo','O grupo mudou',`#community/groups/${group.id}`);await notify(db,alice.githubId,'other-group','Aviso de fora','Outro assunto','#community');
    await safetyAction(db,alice,{action:'mute-group',groupId:group.id});await notify(db,alice.githubId,'new-muted','Pedido resolvido','Mudou',`#community/groups/${group.id}`,{actorId:bob.githubId,groupId:group.id});
    let inbox=await readInbox(db,alice);assert.equal(inbox.items.some(n=>['old-group','new-muted'].includes(n.id)),false);assert.ok(inbox.items.some(n=>n.id==='other-group'));assert.equal(inbox.unread,inbox.items.filter(n=>n.unread).length);
    assert.equal(await db.collection('communityNotifications').countDocuments({_id:'new-muted'}),0);assert.equal((await readSocial(db,alice)).groups[0].muted,true);
    await assert.rejects(safetyAction(db,carol,{action:'mute-group',groupId:group.id}),{status:403});
    await safetyAction(db,alice,{action:'unmute-group',groupId:group.id});await notify(db,alice.githubId,'reactivated','Grupo','Novo aviso',`#community/groups/${group.id}`,{groupId:group.id});assert.ok((await readInbox(db,alice)).items.some(n=>n.id==='reactivated'));
    const refreshed=await db.collection('users').findOne({_id:alice._id});assert.equal(refreshed.githubStats.xp,321);assert.equal(refreshed.career.xp,456);assert.equal(await db.collection('communitySeasons').countDocuments({}),0);
  }finally{await db.dropDatabase();await client.close();}
});
