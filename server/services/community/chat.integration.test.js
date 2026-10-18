const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { sendMessage, readChat, deleteMessage } = require('./chat');
test('MongoDB: shared chat persists, throttles concurrent sends, retries once, paginates and enforces owner deletion without XP', {skip:!process.env.MONGODB_TEST_URI}, async () => {
  const client=await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db=client.db(`progresshub_chat_${new ObjectId().toHexString()}`);
  const now=new Date();
  const alice={_id:new ObjectId(),githubId:'42',githubLogin:'alice',communityOptIn:true,picture:'',communityAppearance:{frame:'crystal',cover:'custom',title:'building'},githubToken:'secret',email:'secret@example.com',githubStats:{xp:123}};
  const bob={_id:new ObjectId(),githubId:'43',githubLogin:'bob',communityOptIn:false};
  try {
    await db.collection('users').insertMany([alice,bob]);
    await db.collection('communityMessages').createIndex({requestKey:1},{unique:true});
    const first=await sendMessage(db,alice,{text:'Construindo um projeto <script>alert(1)</script>',requestId:'first-message-0001',githubId:'43'},now);
    assert.equal(first.author.login,'alice');assert.equal(first.author.profileId,'42');assert.equal(first.author.appearance.frame,'crystal');
    const retry=await sendMessage(db,alice,{text:'Construindo um projeto <script>alert(1)</script>',requestId:'first-message-0001'},now);
    assert.equal(first.id,retry.id);assert.equal(await db.collection('communityMessages').countDocuments({}),1);
    await assert.rejects(sendMessage(db,alice,{text:'Spam',requestId:'second-message-0002'},now),{status:429});
    const race=await Promise.allSettled([sendMessage(db,alice,{text:'Um',requestId:'race-message-00001'},new Date(now.getTime()+6000)),sendMessage(db,alice,{text:'Dois',requestId:'race-message-00002'},new Date(now.getTime()+6000))]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    await sendMessage(db,bob,{text:'Olá',requestId:'bob-message-000001'},now);
    let page=await readChat(db,alice);
    assert.equal(page.messages.find(m=>m.author.login==='bob').author.profileId,null);
    assert.equal(JSON.stringify(page).includes('secret'),false);
    await assert.rejects(deleteMessage(db,bob,first.id),{status:404});
    await deleteMessage(db,alice,first.id);await deleteMessage(db,alice,first.id);
    assert.equal((await db.collection('communityMessages').findOne({_id:new ObjectId(first.id)})).text,undefined);
    for(let i=0;i<35;i++) await db.collection('communityMessages').insertOne({githubId:'43',text:`message-${i}`,createdAt:now,requestKey:`fixture-${i}`});
    page=await readChat(db,alice);
    assert.equal(page.messages.length,30);assert.equal(page.hasOlder,true);
    const older=await readChat(db,alice,{before:page.oldest});
    assert.ok(older.messages.length>0);assert.ok(older.messages.every(m=>m.id<page.oldest));
    const refreshed=await readChat(db,bob,{known:first.id});
    const removed=refreshed.messages.find(m=>m.id===first.id);
    assert.equal(removed.deleted,true);assert.equal(removed.text,'');
    assert.equal((await db.collection('users').findOne({_id:alice._id})).githubStats.xp,123);
    assert.equal(await db.collection('communitySeasons').countDocuments({}),0);
    assert.equal(await db.collection('missionRewards').countDocuments({}),0);
  } finally {await db.dropDatabase();await client.close();}
});

test('HTTP: chat rejects unauthenticated access, non-GitHub sessions and cross-origin writes before database access', {skip:!process.env.MONGODB_TEST_URI}, async () => {
  const express=require('express');
  const router=require('../../routes/community/community.routes');
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.isAuthenticated=()=>req.get('X-Test-Session')!=='none';req.user={_id:'test',...(req.get('X-Test-Session')==='github'?{githubId:'42'}:{})};next();});
  app.use('/community',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const base=`http://127.0.0.1:${server.address().port}/community`;
    assert.equal((await fetch(`${base}/chat`,{headers:{'X-Test-Session':'none'}})).status,401);
    assert.equal((await fetch(`${base}/chat`,{headers:{'X-Test-Session':'google'}})).status,400);
    for(const path of ['/xp-history','/admin','/safety','/feed','/help','/inbox','/chat/attachments/012345678901234567890123']) assert.equal((await fetch(`${base}${path}`,{headers:{'X-Test-Session':'none'}})).status,401);
    for(const path of ['/admin','/safety','/chat','/chat/delete','/chat/attachments','/feed','/social','/help','/inbox']) {
      const response=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Session':'github',Origin:'https://untrusted.example'},body:'{}'});
      assert.equal(response.status,403);
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
