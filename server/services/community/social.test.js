const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, MongoClient } = require('mongodb');
const { validatePost, channelFor, readSocial, socialAction, feedAction, readFeed } = require('./social');
const { sendMessage, readChat } = require('./chat');
test('social content rejects oversized/unsafe images and cannot forge identity', () => {
  assert.throws(() => validatePost({ text: '', requestId: 'valid-request-0001' }), { status: 400 });
  assert.throws(() => validatePost({ text: 'hello', image: 'javascript:alert(1)', requestId: 'valid-request-0001' }), { status: 400 });
  assert.throws(() => validatePost({ text: 'x'.repeat(2001), requestId: 'valid-request-0001' }), { status: 400 });
  assert.deepEqual(validatePost({ text: '<script>plain text</script>', requestId: 'valid-request-0001', githubId: 'forged' }), { text: '<script>plain text</script>', image: '', kind: 'progress', requestId: 'valid-request-0001' });
});
test('MongoDB: social feed, contacts, invitations and channel isolation', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI); const db = client.db(`social_${new ObjectId()}`);
  const a = { _id: new ObjectId(), githubId: '100', githubLogin: 'alice', githubToken: 'secret', githubStats: { xp: 10 } }; const b = { _id: new ObjectId(), githubId: '101', githubLogin: 'bob', communityOptIn: true }; const c = { _id: new ObjectId(), githubId: '102', githubLogin: 'charlie' };
  try {
    await db.collection('users').insertMany([a,b,c]); await db.collection('communityPosts').createIndex({ requestKey: 1 }, { unique: true }); await db.collection('communityMessages').createIndex({ requestKey: 1 }, { unique: true });
    await socialAction(db,a,{action:'contact-request',login:'bob'}); let social = await readSocial(db,b); assert.equal(social.contacts[0].incoming,true); const contact = social.contacts[0].id;
    await socialAction(db,c,{action:'contact-accept',id:contact}); assert.equal((await readSocial(db,a)).contacts[0].status,'pending');
    await socialAction(db,b,{action:'contact-accept',id:contact}); await socialAction(db,a,{action:'group-create',name:'Builders',description:'hello'});
    const group=(await readSocial(db,a)).groups[0]; const channel=`group:${group.id}`;
    await socialAction(db,a,{action:'group-invite',id:group.id,githubId:b.githubId}); await assert.rejects(channelFor(db,b,channel),{status:403});
    await socialAction(db,b,{action:'group-accept',id:group.id}); assert.equal(await channelFor(db,b,channel),channel);
    const privateMessage=await sendMessage(db,a,{channel,text:'private',requestId:'private-message-0001'});
    assert.equal((await readChat(db,b,{channel})).messages.length,1);
    assert.equal((await readChat(db,c,{known:privateMessage.id})).messages.length,0);
    await assert.rejects(readChat(db,c,{channel,known:privateMessage.id}),{status:403});
    await db.collection('communityMessages').insertOne({githubId:a.githubId,text:'legacy general',createdAt:new Date(),requestKey:'legacy'});
    assert.equal((await readChat(db,b)).messages[0].text,'legacy general'); assert.equal((await readChat(db,b,{channel:'help'})).messages.length,0);
    await socialAction(db,b,{action:'group-leave',id:group.id}); await assert.rejects(readChat(db,b,{channel}),{status:403});
    const publish={action:'publish',text:'my project',requestId:'publish-request-0001'}; await feedAction(db,a,publish); await feedAction(db,a,publish);
    let feed=await readFeed(db,b); assert.equal(feed.posts.length,1); assert.equal(JSON.stringify(feed).includes('secret'),false); const postId=feed.posts[0].id;
    await feedAction(db,b,{action:'like',postId,liked:true}); await feedAction(db,b,{action:'like',postId,liked:true});
    const comment={action:'comment',postId,text:'great',requestId:'comment-request-0001'}; await feedAction(db,b,comment); await feedAction(db,b,comment);
    feed=await readFeed(db,b); assert.equal(feed.posts[0].likes,1);assert.equal(feed.posts[0].commentCount,1); assert.equal(feed.posts[0].liked,true);
    await assert.rejects(feedAction(db,b,{action:'delete-post',postId}),{status:403});
    await feedAction(db,c,{action:'delete-comment',postId,id:feed.posts[0].comments[0].id}); assert.equal((await readFeed(db,b)).posts[0].commentCount,1);
    await feedAction(db,a,{action:'delete-post',postId}); assert.equal((await readFeed(db,b)).posts.length,0);
    assert.equal((await db.collection('users').findOne({_id:a._id})).githubStats.xp,10);
  } finally { await db.dropDatabase(); await client.close(); }
});
