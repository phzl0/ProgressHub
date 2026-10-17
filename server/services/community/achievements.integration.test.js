const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { reconcileAchievements, readAchievements } = require('./achievements');
const { updateBonuses } = require('../missions/store');
const { syncSeason, careerFor } = require('../github/league');
const { scoreContributions, periodFor } = require('../github/scoring');
async function fixture() {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`progresshub_achievements_${new ObjectId().toHexString()}`);
  await db.collection('communitySeasons').createIndex({githubId:1,period:1},{unique:true});
  const user = { _id: new ObjectId(), githubId:'42', githubLogin:'developer', communityOptIn:true };
  await db.collection('users').insertOne(user);
  return { db, user, close: async () => { await db.dropDatabase(); await client.close(); } };
}
test('MongoDB: milestones reward once, count in career, survive sync and retain achievements after corrections', {skip:!process.env.MONGODB_TEST_URI}, async () => {
  const f = await fixture(); const {db,user} = f; const now = new Date(); const period = periodFor(now);
  try {
    const stats = {...scoreContributions([10],1,1), period, commitDays:[{date:now.toISOString().slice(0,10),credited:10}]};
    await db.collection('communitySeasons').insertOne({githubId:user.githubId,period,status:'open',stats});
    // GET never awards or edits the ledger.
    await readAchievements(db,user,now);
    assert.equal(await db.collection('achievementRewards').countDocuments({}),0);
    await reconcileAchievements(db,user,now);
    let season = await db.collection('communitySeasons').findOne({githubId:'42',period});
    const firstXP = season.stats.xp; const firstCount = await db.collection('achievementRewards').countDocuments({});
    assert.ok(firstCount >= 5); assert.equal(season.stats.baseXP,175); assert.ok(season.stats.achievementXP>0);
    await reconcileAchievements(db,user,now); await updateBonuses(db,user,now);
    assert.equal((await careerFor(db,user,false)).xp,firstXP);
    assert.equal(await db.collection('achievementRewards').countDocuments({}),firstCount);
    const collect = async () => ({...scoreContributions([10],1,1),period,commitDays:stats.commitDays,syncedAt:new Date()});
    await syncSeason(db,user,period,{force:true,missions:false,collect});
    assert.equal((await careerFor(db,user,false)).xp,firstXP);
    const cache = await db.collection('users').findOne({_id:user._id});
    await db.collection('communitySeasons').updateOne({githubId:'42',period},{$set:{'stats.commits':0,'stats.mergedPRs':0,'stats.commitDays':[]}});
    const view = await readAchievements(db,cache,now);
    assert.equal(view.achievements.find(a=>a.id==='commits-1').awarded,true);
    assert.equal(view.achievements.find(a=>a.id==='commits-1').progress,100);
    assert.ok(cache.career.achievements.includes('Primeiro commit'));
  } finally { await f.close(); }
});
test('MongoDB: interrupted achievement credits across months never duplicate and uncredited rewards move to current month', {skip:!process.env.MONGODB_TEST_URI}, async () => {
  const f=await fixture();const {db,user}=f; const old=new Date('2030-01-31T23:59:00Z');const now=new Date('2030-02-03T12:00:00Z');
  try {
    await db.collection('communitySeasons').insertOne({githubId:'42',period:'2030-01',status:'open',stats:{...scoreContributions([1],0),period:'2030-01'}});
    // Simulate a crash after atomic season credit but before marking the receipt paid.
    await db.collection('achievementRewards').insertOne({_id:'42:commits-1:v1',githubId:'42',achievementId:'commits-1',name:'Primeiro commit',xp:300,status:'pending',creditedPeriod:'2030-01',awardedAt:old});
    await updateBonuses(db,user,old);
    await db.collection('communitySeasons').updateOne({githubId:'42',period:'2030-01'},{$set:{status:'closed'}});
    await db.collection('achievementRewards').insertOne({_id:'42:reviews-1:v1',githubId:'42',achievementId:'reviews-1',name:'Um olhar que ajuda',xp:300,status:'pending',creditedPeriod:'2030-01',awardedAt:old});
    await reconcileAchievements(db,user,now); await reconcileAchievements(db,user,now);
    const first=await db.collection('achievementRewards').findOne({_id:'42:commits-1:v1'});
    const second=await db.collection('achievementRewards').findOne({_id:'42:reviews-1:v1'});
    assert.equal(first.status,'paid');assert.equal(first.creditedPeriod,'2030-01');
    assert.equal(second.status,'paid');assert.equal(second.creditedPeriod,'2030-02');
    assert.equal((await db.collection('communitySeasons').findOne({githubId:'42',period:'2030-01'})).stats.xp,310);
    assert.equal((await db.collection('communitySeasons').findOne({githubId:'42',period:'2030-02'})).stats.xp,300);
    assert.equal((await careerFor(db,user,false)).xp,610);
  } finally {await f.close();}
});
test('MongoDB: simultaneous mission claims serialize achievement rewards with the shared account lease', {skip:!process.env.MONGODB_TEST_URI}, async () => {
  const f=await fixture(); const {db,user}=f; const now=new Date(); const period=periodFor(now);
  try {
    await db.collection('users').updateOne({_id:user._id},{$set:{missionsStartedAt:new Date(now.getTime()-1000)}});
    await db.collection('communitySeasons').insertOne({githubId:'42',period,status:'open',stats:{...scoreContributions([5],0),period}});
    await db.collection('missionEvents').insertOne({githubId:'42',kind:'commit',id:'sha',at:now.toISOString()});
    const {claimMission}=require('../missions/store');
    const attempts=await Promise.allSettled([claimMission(db,user,'daily-1',now.toISOString().slice(0,10),now),claimMission(db,user,'daily-1',now.toISOString().slice(0,10),now)]);
    assert.ok(attempts.some(r=>r.status==='fulfilled'));
    assert.equal(await db.collection('missionRewards').countDocuments({}),1);
    assert.equal(await db.collection('achievementRewards').countDocuments({}),2);
    const record=await db.collection('communitySeasons').findOne({githubId:'42',period});
    assert.equal(record.stats.baseXP,50);assert.equal(record.stats.missionXP,300);assert.equal(record.stats.achievementXP,600);assert.equal(record.stats.xp,950);
    assert.equal((await db.collection('users').findOne({_id:user._id})).syncLockId,undefined);
  } finally {await f.close();}
});
