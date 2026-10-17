const test=require('node:test');const assert=require('node:assert/strict');const {MongoClient,ObjectId}=require('mongodb');
const {catalogSearch}=require('./search-catalog');const {searchCommunity}=require('./search');
const {socialAction}=require('./social');
const {addComment,readComments,deleteComment}=require('./comments');const {readInbox}=require('./notifications');const {react}=require('./reactions');
test('catalog search understands syllables, accents, synonyms and small typos without AI',()=>{
  for(const [query,path] of [['clas','#ranking'],['posição','#ranking'],['onde vejo meu exp','#progress'],['medalha','#progress/achievements'],['rankng','#ranking'],['foto','#me'],['misso','#missions']])assert.ok(catalogSearch(query).some(r=>r.path===path),`${query}: ${JSON.stringify(catalogSearch(query))}`);
});
test('MongoDB: reply threads remain scoped, notify once, paginate and retain context after deletion', {skip:!process.env.MONGODB_TEST_URI},async()=>{
  const client=await MongoClient.connect(process.env.MONGODB_TEST_URI);const db=client.db(`threads_${new ObjectId()}`);
  const a={_id:new ObjectId(),githubId:'10',githubLogin:'alice',communityOptIn:true,githubToken:'SECRET'};const b={_id:new ObjectId(),githubId:'20',githubLogin:'bob',communityOptIn:false};const c={_id:new ObjectId(),githubId:'30',githubLogin:'carol',communityOptIn:true};const postId=new ObjectId().toHexString();const other=new ObjectId().toHexString();
  try{
    await db.collection('users').insertMany([a,b,c]);await db.collection('communityPosts').insertMany([{_id:new ObjectId(postId),githubId:a.githubId,text:'Cache na API',kind:'feed'},{_id:new ObjectId(other),githubId:c.githubId,text:'Outro post'}]);
    const groupAttempt={action:'group-create',name:'Equipe de estudos',description:'Vamos construir',requestId:'create-group-000001'};await socialAction(db,a,groupAttempt);await socialAction(db,a,groupAttempt);assert.equal(await db.collection('communityGroups').countDocuments({owner:a.githubId}),1);
    const root=await addComment(db,a,'post',postId,{text:'Comentário original',requestId:'root-comment-00001'});
    const replyInput={text:'Uma sugestão',requestId:'reply-comment-0001',replyTo:root.id};const first=await addComment(db,b,'post',postId,replyInput);await addComment(db,b,'post',postId,replyInput);
    assert.equal((await readInbox(db,a)).items.length,1);assert.equal((await readInbox(db,c)).items.length,0);
    const notification=(await readInbox(db,a)).items[0];assert.ok(notification.path.includes(encodeURIComponent(root.id)));
    const second=await addComment(db,c,'post',postId,{text:'Concordo com a sugestão',requestId:'nested-reply-00001',replyTo:first.id});
    assert.equal((await db.collection('communityComments').findOne({_id:second.id})).rootId,root.id);
    let page=await readComments(db,c,{postId});assert.equal(page.comments.length,1);assert.equal(page.comments[0].replyCount,2);assert.equal(page.comments[0].replies.find(r=>r.id===second.id).replyToAuthor,'bob');assert.equal(JSON.stringify(page).includes('SECRET'),false);
    await assert.rejects(addComment(db,c,'post',other,{text:'cross content',requestId:'cross-reply-00001',replyTo:root.id}),{status:404});
    await assert.rejects(deleteComment(db,c,'post',postId,root.id),{status:404});
    await react(db,a,{kind:'comment',targetId:first.id,reaction:'like'});assert.equal((await readComments(db,b,{postId})).comments[0].replies.find(r=>r.id===first.id).likes,1);
    for(let n=0;n<34;n++)await addComment(db,b,'post',postId,{text:`Resposta ${n}`,requestId:`reply-page-${n.toString().padStart(6,'0')}`,replyTo:root.id});
    page=await readComments(db,a,{postId});assert.equal(page.comments[0].replies.length,10);assert.equal(page.comments[0].replyHasMore,true);
    const all=await readComments(db,a,{postId,threadId:root.id});assert.equal(all.comments.length,30);assert.equal(all.hasMore,true);
    const tail=await readComments(db,a,{postId,threadId:root.id,before:all.comments.at(-1).id});assert.equal(tail.comments.length,6);
    await deleteComment(db,a,'post',postId,root.id);page=await readComments(db,b,{postId});assert.equal(page.comments[0].deleted,true);assert.equal(page.comments[0].text,'');assert.equal(page.comments[0].replyCount,36);
    await assert.rejects(react(db,b,{kind:'comment',targetId:root.id,reaction:'sad'}),{status:404});
    await addComment(db,a,'post',postId,{text:'Continuando a conversa',requestId:'post-delete-reply1',replyTo:second.id});
    const helpId=new ObjectId().toHexString();await db.collection('communityGroups').insertOne({_id:new ObjectId(helpId),type:'help',name:'Cache',description:'Problema na API',owner:a.githubId,members:[a.githubId],invited:[],helpStatus:'open',helpLimit:4});
    const hr=await addComment(db,a,'help',helpId,{text:'Sugestão inicial',requestId:'help-root-0000001'});await addComment(db,b,'help',helpId,{text:'Resposta sem entrar no grupo',requestId:'help-reply-000001',replyTo:hr.id});
    assert.equal((await readComments(db,b,{helpId})).comments[0].replyCount,1);assert.equal((await db.collection('communityGroups').findOne({_id:new ObjectId(helpId)})).members.length,1);
    await assert.rejects(addComment(db,c,'help',helpId,{text:'Outro contexto',requestId:'help-cross-000001',replyTo:root.id}),{status:404});
    const results=await searchCommunity(db,a,{q:'conquista primeiro commit'});assert.ok(results.results.some(r=>r.type==='Conquista'&&r.label==='Primeiro commit'));
    assert.ok((await searchCommunity(db,a,{q:'ajuda api'})).results.some(r=>r.type==='Pedido de ajuda'));assert.ok((await searchCommunity(db,a,{q:'configuracao'})).results.some(r=>r.path==='#settings'));
  }finally{await db.dropDatabase();await client.close();}
});
