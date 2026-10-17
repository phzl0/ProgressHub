const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { careerRanking } = require('./career-ranking');
test('MongoDB: career top ten sums seasons, excludes private users and supports legacy accounts', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_career_${new ObjectId().toHexString()}`);
  try {
    await db.collection('users').insertMany([
      { githubId: '1', githubLogin: 'veteran', communityOptIn: true, githubStats: { xp: 10 }, career: { xp: 1 }, email: 'secret@example.com', githubAccessToken: 'secret' },
      { githubId: '2', githubLogin: 'newcomer', communityOptIn: true, githubStats: { xp: 500 } },
      { githubId: '3', githubLogin: 'private', communityOptIn: false, githubStats: { xp: 999999 } },
      ...Array.from({ length: 12 }, (_, i) => ({ githubId: String(10 + i), githubLogin: `peer${i}`, communityOptIn: true, githubStats: { xp: 0 } }))
    ]);
    await db.collection('communitySeasons').insertMany([
      { githubId: '1', period: '2026-09', stats: { xp: 1000 } },
      { githubId: '1', period: '2026-10', stats: { xp: 10 } }
    ]);
    const board = await careerRanking(db);
    assert.equal(board.users.length, 10);
    assert.deepEqual(board.users.slice(0, 2).map(u => [u.githubId, u.career.xp]), [['1', 1010], ['2', 500]]);
    assert.equal(board.users.some(u => u.githubId === '3'), false);
    assert.equal(JSON.stringify(board).includes('secret'), false);
    await db.collection('users').updateOne({ githubId: '1' }, { $set: { communityOptIn: false } });
    assert.equal((await careerRanking(db)).users.some(u => u.githubId === '1'), false);
  } finally { await db.dropDatabase(); await client.close(); }
});
