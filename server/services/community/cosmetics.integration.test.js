const test=require('node:test');
const assert=require('node:assert/strict');
const {MongoClient,ObjectId}=require('mongodb');
const {claimWelcome,validateOwnedAppearance,appearanceFor,inventoryFor}=require('./cosmetics');
test('MongoDB: welcome collection persists once across concurrent claims and expiry does not affect XP',{skip:!process.env.MONGODB_TEST_URI},async()=>{
 const client=await MongoClient.connect(process.env.MONGODB_TEST_URI);const db=client.db(`progresshub_cosmetics_${new ObjectId().toHexString()}`);
 const user={_id:new ObjectId(),githubId:'42',githubStats:{xp:1500}};const now=new Date();
 try{
  await db.collection('users').insertOne(user);
  const results=await Promise.all(Array.from({length:10},()=>claimWelcome(db,user,now)));
  assert.ok(results.every(result=>result.welcomeClaimed));
  const original=await db.collection('users').findOne({_id:user._id});
  const later=await claimWelcome(db,user,new Date(now.getTime()+86400000));
  assert.equal(later.catalog.frames.find(i=>i.id==='energy').expiresAt,original.communityCosmetics.welcomeExpiresAt.toISOString());
  const appearance=validateOwnedAppearance({frame:'energy',cover:'custom',title:'energy',chat:'energy'},original,now);
  await db.collection('users').updateOne({_id:user._id},{$set:{communityAppearance:appearance}});
  const saved=await db.collection('users').findOne({_id:user._id});assert.equal(saved.githubStats.xp,1500);
  assert.equal(appearanceFor(saved,now).frame,'energy');
  assert.equal(appearanceFor(saved,original.communityCosmetics.welcomeExpiresAt).frame,'essential');
  assert.equal(inventoryFor(saved,original.communityCosmetics.welcomeExpiresAt).catalog.frames.find(i=>i.id==='energy').owned,false);
 }finally{await db.dropDatabase();await client.close();}
});
