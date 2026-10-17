const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { createGoal, readGoal, communityChallenge } = require('./engagement');
test('MongoDB: one weekly goal per account, evidence progress and public collective totals', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_engagement_${new ObjectId().toHexString()}`);
  const now = new Date('2026-10-16T12:00:00Z');
  const user = { _id: new ObjectId(), githubId: '42', communityOptIn: true };
  try {
    await db.collection('users').insertMany([user, { githubId: '43', communityOptIn: false }]);
    const attempts = await Promise.allSettled([createGoal(db, user, { metric: 'days', target: 2 }, now), createGoal(db, user, { metric: 'commits', target: 5 }, now)]);
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
    assert.equal(await db.collection('personalGoals').countDocuments({}), 1);
    const stored = await db.collection('personalGoals').findOne({ githubId: '42' });
    await db.collection('missionEvents').insertMany([
      { githubId: '42', kind: 'commit', id: 'sha1', at: '2026-10-16T13:00:00Z' },
      { githubId: '42', kind: 'commit', id: 'sha2', at: '2026-10-17T13:00:00Z' },
      { githubId: '43', kind: 'commit', id: 'private-account', at: '2026-10-17T13:00:00Z' },
      { githubId: '42', kind: 'commit', id: 'old', at: '2026-10-11T13:00:00Z' }
    ]);
    const later = new Date('2026-10-18T12:00:00Z');
    const result = await readGoal(db, user, later);
    assert.equal(result.goal.metric, stored.metric); assert.equal(result.goal.current, 2);
    const challenge = await communityChallenge(db, user, later);
    assert.equal(challenge.current, 2); assert.equal(challenge.participants, 1); assert.equal(challenge.mine, 2);
    await db.collection('users').updateOne({ githubId: '42' }, { $set: { communityOptIn: false } });
    assert.equal((await communityChallenge(db, null, later)).current, 0);
    assert.equal(await db.collection('missionRewards').countDocuments({}), 0);
  } finally { await db.dropDatabase(); await client.close(); }
});
