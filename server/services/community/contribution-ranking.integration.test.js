const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { contributionRanking } = require('./contribution-ranking');
test('MongoDB: contribution ranking breaks ties by reaching the current count first, preserves privacy and ignores duplicates', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_contribution_rank_${new ObjectId().toHexString()}`);
  try {
    await db.collection('users').insertMany([
      { githubId: '42', githubLogin: 'later', communityOptIn: true, githubToken: 'secret' },
      { githubId: '43', githubLogin: 'earlier', communityOptIn: true, communityAppearance: { frame: 'crystal', cover: 'orbit', title: 'building' } },
      { githubId: '44', githubLogin: 'private', communityOptIn: false }
    ]);
    const event = (githubId, id, at) => ({ githubId, id, at, kind: 'commit' });
    await db.collection('missionEvents').insertMany([
      event('42', 'a', '2026-10-16T10:00:00Z'), event('42', 'b', '2026-10-16T12:00:00Z'),
      event('43', 'c', '2026-10-16T10:00:00Z'), event('43', 'd', '2026-10-16T11:00:00Z'),
      event('43', 'd', '2026-10-16T11:00:00Z'), event('44', 'e', '2026-10-16T09:00:00Z'),
      event('43', 'old', '2026-10-10T09:00:00Z')
    ]);
    const now = new Date('2026-10-17T12:00:00Z');
    let rank = await contributionRanking(db, { githubId: '42' }, now);
    assert.deepEqual(rank.users.map(u => u.githubId), ['43', '42']); assert.equal(rank.me.position, 2);
    assert.equal(rank.total, 4); assert.equal(rank.participants, 2); assert.equal(rank.users[0].appearance.frame, 'crystal');
    assert.equal(JSON.stringify(rank).includes('secret'), false);
    // More contributions always rank ahead, even when achieved later.
    await db.collection('missionEvents').insertOne(event('42', 'f', '2026-10-16T14:00:00Z'));
    rank = await contributionRanking(db, { githubId: '42' }, now);
    assert.equal(rank.me.position, 1); assert.equal(rank.users[0].githubId, '42');
    assert.equal((await contributionRanking(db, { githubId: '44' }, now)).me, null);
    assert.equal(await db.collection('missionRewards').countDocuments({}), 0);
  } finally { await db.dropDatabase(); await client.close(); }
});
