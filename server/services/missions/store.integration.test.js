const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { syncMissions, readMissions, claimMission } = require('./store');
const { periodFor, scoreContributions } = require('../github/scoring');
test('MongoDB: mission rewards credit once and add to normal action XP', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_missions_test_${new ObjectId().toHexString()}`);
  const now = new Date();
  const user = { _id: new ObjectId(), githubId: '42', communityOptIn: true, missionsStartedAt: new Date(now.getTime() - 1000) };
  try {
    await db.collection('users').insertOne(user);
    await db.collection('communitySeasons').createIndex({ githubId: 1, period: 1 }, { unique: true });
    await db.collection('communitySeasons').insertOne({ githubId: '42', period: periodFor(now), status: 'open', stats: { ...scoreContributions([5], 0), period: periodFor(now) } });
    const collector = async () => ({ partial: false, events: [{ kind: 'commit', id: 'sha-new', repo: 'user/project', at: now.toISOString() }] });
    await syncMissions(db, user, now, collector);
    await syncMissions(db, user, now, collector);
    assert.equal(await db.collection('missionRewards').countDocuments({ githubId: '42' }), 0);
    const before = await readMissions(db, user, now);
    const ready = before.missions.find(m => m.id === 'daily-1');
    assert.equal(ready.progress, 100);
    assert.equal(ready.awarded, false);
    assert.ok(ready.completedAt);
    await assert.rejects(claimMission(db, user, 'daily-3', ready.periodKey, now), { status: 409 });
    await claimMission(db, user, ready.id, ready.periodKey, now);
    await claimMission(db, user, ready.id, ready.periodKey, now);
    await syncMissions(db, user, now, collector);
    assert.equal(await db.collection('missionRewards').countDocuments({ githubId: '42' }), 1);
    const record = await db.collection('communitySeasons').findOne({ githubId: '42', period: periodFor(now) });
    assert.equal(record.stats.xp, 350);
    assert.equal(record.stats.baseXP, 50);
    assert.equal(record.stats.missionXP, 300);
    const data = await readMissions(db, user, now);
    assert.equal(data.missions.find((mission) => mission.id === 'daily-1').awarded, true);
  } finally { await db.dropDatabase(); await client.close(); }
});

test('MongoDB: previous-period bonuses are separate and disappear from pending after claiming', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_pending_test_${new ObjectId().toHexString()}`);
  const now = new Date('2026-10-17T12:00:00Z');
  const user = { _id: new ObjectId(), githubId: '44', missionsStartedAt: new Date('2026-10-16T00:00:00Z') };
  try {
    await db.collection('users').insertOne(user);
    await db.collection('missionEvents').insertOne({ githubId: '44', kind: 'commit', id: 'sha', at: '2026-10-16T12:00:00Z' });
    let data = await readMissions(db, user, now);
    assert.equal(data.missions.length, 15); assert.equal(data.missions.filter(m => m.id === 'daily-1').length, 1);
    assert.equal(data.pendingRewards.filter(m => m.id === 'daily-1').length, 1);
    const pending = data.pendingRewards.find(m => m.id === 'daily-1');
    await claimMission(db, user, pending.id, pending.periodKey, now);
    data = await readMissions(db, user, now);
    assert.equal(data.pendingRewards.length, 0); assert.equal(data.missions.find(m => m.id === 'daily-1').awarded, false);
    assert.equal(data.recentRewards.length, 1);
  } finally { await db.dropDatabase(); await client.close(); }
});
