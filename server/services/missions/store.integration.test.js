const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { syncMissions, readMissions } = require('./store');
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
    assert.equal(await db.collection('missionRewards').countDocuments({ githubId: '42' }), 1);
    const record = await db.collection('communitySeasons').findOne({ githubId: '42', period: periodFor(now) });
    assert.equal(record.stats.xp, 350);
    assert.equal(record.stats.baseXP, 50);
    assert.equal(record.stats.missionXP, 300);
    const data = await readMissions(db, user, now);
    assert.equal(data.missions.find((mission) => mission.id === 'daily-1').awarded, true);
  } finally { await db.dropDatabase(); await client.close(); }
});
