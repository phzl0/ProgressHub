const test=require('node:test');
const assert=require('node:assert/strict');
const {MongoClient,ObjectId}=require('mongodb');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createHmac,randomUUID}=require('node:crypto');
const net=require('node:net');
const path=require('node:path');
test('production HTTP uses the configured session database and protects logout', {skip:!process.env.MONGODB_TEST_URI,timeout:30000}, async()=>{
  const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const name='production_test_'+randomUUID().replaceAll('-','');
  const client=await MongoClient.connect(process.env.MONGODB_TEST_URI);const db=client.db(name);
  const secret='test-production-session-'.repeat(3);const sid=randomUUID();const id=new ObjectId();
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,NODE_ENV:'production',PORT:String(port),CLIENT:'https://public.example.test',GITHUB_CALLBACK_URL:'https://public.example.test/api/community/auth/callback',SESSION_SECRET:secret,MONGODB_URI:process.env.MONGODB_TEST_URI,MONGODB_DB:name,GITHUB_TOKEN_KEY:'a'.repeat(64),GITHUB_CLIENT_ID:'fixture-client',GITHUB_CLIENT_SECRET:'fixture-secret',COMMUNITY_ADMIN_GITHUB_IDS:'123',TRUST_PROXY:'1'},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  try {
    let healthy=false;
    for(let n=0;n<100;n++){try{healthy=(await fetch(base+'/api/health')).ok;}catch(_){}if(healthy)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(healthy,'server starts with production settings');
    const health=await fetch(base+'/api/health');assert.equal(health.headers.get('cache-control'),'private, no-store');assert.equal(health.headers.get('x-content-type-options'),'nosniff');
    await db.collection('users').insertOne({_id:id,githubId:'123',name:'Fixture'});
    await db.collection('sessions').insertOne({_id:sid,expires:new Date(Date.now()+3600000),session:JSON.stringify({cookie:{originalMaxAge:86400000,expires:new Date(Date.now()+3600000),secure:true,httpOnly:true,path:'/',sameSite:'lax'},passport:{user:String(id)}})});
    const signature=createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'');
    const headers={Cookie:'connect.sid='+encodeURIComponent(`s:${sid}.${signature}`),'X-Forwarded-Proto':'https',Origin:'https://public.example.test'};
    assert.equal((await fetch(base+'/api/auth/current_user')).status,401);
    const me=await fetch(base+'/api/auth/current_user',{headers});assert.equal(me.status,200);assert.equal((await me.json()).name,'Fixture');
    assert.equal((await fetch(base+'/api/auth/logout',{headers})).status,405);
    assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{...headers,Origin:'https://attacker.test'}})).status,403);
    const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/HttpOnly/);assert.match(logout.headers.get('set-cookie'),/Secure/);assert.match(logout.headers.get('set-cookie'),/SameSite=Lax/);
    assert.equal(await db.collection('sessions').findOne({_id:sid}),null);
    assert.equal((await fetch(base+'/api/auth/current_user',{headers})).status,401);
  } finally {
    if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
    await db.dropDatabase();await client.close();
  }
});
