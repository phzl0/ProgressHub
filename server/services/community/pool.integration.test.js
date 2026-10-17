const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { ensurePool, poolView, setParticipation, settlePool, payShare } = require('./pool');
const { scoreContributions } = require('../github/scoring');
const start = new Date('2030-01-07T00:00:00Z');
async function fixture(counts) {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_pool_${new ObjectId().toHexString()}`);
  const users = counts.map((count, index) => ({ _id: new ObjectId(), githubId: String(42 + index), githubLogin: `member-${index}`, communityOptIn: true }));
  await db.collection('users').insertMany(users);
  await db.collection('communitySeasons').createIndex({ githubId: 1, period: 1 }, { unique: true });
  const pool = await ensurePool(db, start);
  const events = counts.flatMap((count, index) => Array.from({ length: count }, (_, n) => ({
    _id: `${users[index].githubId}:${n}`, githubId: users[index].githubId, kind: 'commit', id: `sha-${index}-${n}`,
    at: new Date(start.getTime() + (index + 1) * 3600000 + n * 1000).toISOString(), confirmedAt: new Date(start.getTime() + 86400000)
  })));
  if (events.length) await db.collection('missionEvents').insertMany(events);
  return { db, client, users, pool, close: async () => { await db.dropDatabase(); await client.close(); } };
}
test('MongoDB: pool pays proportional shares once, preserves withdrawn contributions and resumes interrupted payouts', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const f = await fixture([50, 30, 20]); const { db, pool, users } = f;
  const closes = new Date(new Date(pool.closesAt).getTime() + 1);
  try {
    await db.collection('communitySeasons').insertOne({ githubId: '42', period: '2030-01', status: 'open', stats: { ...scoreContributions([5], 0), period: '2030-01' } });
    await db.collection('missionRewards').insertOne({ _id: 'mission-42', githubId: '42', creditedPeriod: '2030-01', xp: 300 });
    await setParticipation(db, users[0], false, new Date('2030-01-10T00:00:00Z'));
    const view = await poolView(db, users[1], new Date('2030-01-11T00:00:00Z'));
    assert.equal(view.total, 100); assert.equal(view.me.estimatedXP, 12000); assert.equal(view.users[0].githubId, null);
    assert.equal(JSON.stringify(view).includes('member-0'), false);
    await settlePool(db, pool._id, new Date(new Date(pool.closesAt).getTime() - 1));
    assert.equal(await db.collection('communityPoolShares').countDocuments({}), 0);
    // Account busy during the first attempt; the frozen result must resume, not recalculate.
    await db.collection('users').updateOne({ githubId: '43' }, { $set: { syncLockUntil: new Date(closes.getTime() + 600000), syncLockId: 'busy' } });
    await Promise.all([settlePool(db, pool._id, closes), settlePool(db, pool._id, closes)]);
    assert.equal((await db.collection('communityPools').findOne({ _id: pool._id })).status, 'paying');
    assert.equal(await db.collection('communityPoolShares').countDocuments({ status: 'paid' }), 2);
    await db.collection('users').updateOne({ githubId: '43' }, { $unset: { syncLockUntil: '', syncLockId: '' } });
    await settlePool(db, pool._id, new Date(closes.getTime() + 1000));
    await settlePool(db, pool._id, new Date(closes.getTime() + 2000));
    assert.equal((await db.collection('communityPools').findOne({ _id: pool._id })).status, 'paid');
    const shares = await db.collection('communityPoolShares').find({}).sort({ githubId: 1 }).toArray();
    assert.deepEqual(shares.map(s => s.xp), [20000, 12000, 8000]); assert.equal(shares.length, 3);
    const owner = await db.collection('users').findOne({ githubId: '42' });
    assert.equal(owner.career.xp, 20350); assert.equal(owner.githubStats.communityXP, 20000); assert.equal(owner.githubStats.missionXP, 300);
    // Simulate a crash after season reconciliation but before the receipt is marked paid.
    const share = shares[0];
    await db.collection('communitySeasons').updateOne({ githubId: '42', period: '2030-01' }, { $set: { status: 'closed' } });
    await db.collection('communityPoolShares').updateOne({ _id: share._id }, { $set: { status: 'pending' } });
    await payShare(db, share, new Date('2030-02-03T00:00:00Z'));
    assert.equal((await db.collection('users').findOne({ githubId: '42' })).career.xp, 20350);
    assert.equal((await db.collection('communityPoolShares').findOne({ _id: share._id })).creditedPeriod, '2030-01');
    await db.collection('communitySeasons').insertOne({ githubId: '42', period: '2029-12', status: 'closed', stats: { ...scoreContributions([], 0), period: '2029-12' } });
    const missed = { _id: 'missed:42', githubId: '42', xp: 100, status: 'pending', creditedPeriod: '2029-12', awardedAt: new Date('2029-12-31T00:00:00Z') };
    await db.collection('communityPoolShares').insertOne(missed);
    await payShare(db, missed, new Date('2030-02-03T00:00:00Z'));
    assert.equal((await db.collection('users').findOne({ githubId: '42' })).career.xp, 20450);
    const recovered = await db.collection('communityPoolShares').findOne({ _id: missed._id });
    assert.equal(recovered.creditedPeriod, '2030-02'); assert.equal(recovered.awardedAt.toISOString(), '2030-02-03T00:00:00.000Z');

  } finally { await f.close(); }
});
test('MongoDB: unmet goal pays nothing, a single contributor may receive the full pool, late confirmations are excluded', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  for (const count of [1, 100]) {
    const f = await fixture([count]);
    try {
      await f.db.collection('missionEvents').insertOne({ githubId: '42', kind: 'commit', id: 'late', at: '2030-01-08T08:00:00Z', confirmedAt: new Date(new Date(f.pool.closesAt).getTime() + 1) });
      await settlePool(f.db, f.pool._id, new Date(new Date(f.pool.closesAt).getTime() + 10));
      const result = await f.db.collection('communityPools').findOne({ _id: f.pool._id });
      assert.equal(result.total, count); assert.equal(result.status, count === 100 ? 'paid' : 'not_met');
      const share = await f.db.collection('communityPoolShares').findOne({ githubId: '42' });
      assert.equal(share?.xp || 0, count === 100 ? 40000 : 0);
    } finally { await f.close(); }
  }
});

test('MongoDB: ties keep equal rewards, earlier contribution first; leave and return do not rewrite past eligibility', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const f = await fixture([50, 50]);
  try {
    let view = await poolView(f.db, f.users[1], new Date('2030-01-09T00:00:00Z'));
    assert.deepEqual(view.users.map(user => user.githubId), ['42', '43']);
    assert.deepEqual(view.users.map(user => user.estimatedXP), [20000, 20000]);
    await setParticipation(f.db, f.users[0], false, new Date('2030-01-10T00:00:00Z'));
    await f.db.collection('missionEvents').insertOne({ githubId: '42', kind: 'commit', id: 'while-out', at: '2030-01-11T00:00:00Z', confirmedAt: new Date('2030-01-11T01:00:00Z') });
    await setParticipation(f.db, f.users[0], true, new Date('2030-01-12T00:00:00Z'));
    view = await poolView(f.db, f.users[0], new Date('2030-01-13T00:00:00Z'));
    assert.equal(view.total, 100); assert.equal(view.me.contributions, 50);
  } finally { await f.close(); }
});
