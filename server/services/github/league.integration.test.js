const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { syncSeason, ensureLegacy, careerFor, finalizeSeason, seasonHistory } = require('./league');
const { scoreContributions, periodFor, periodBounds } = require('./scoring');
const uri = process.env.MONGODB_TEST_URI;

// Opt-in disposable database only; never connect to the user's application database.
test('MongoDB: durable seasons, locks, migration and final results', { skip: !uri }, async (t) => {
  const client = await MongoClient.connect(uri);
  const db = client.db(`questlog_test_${new ObjectId().toHexString()}`);
  const current = periodFor();
  const users = db.collection('users');
  const seasons = db.collection('communitySeasons');
  await seasons.createIndex({ githubId: 1, period: 1 }, { unique: true });
  const user = { _id: new ObjectId(), githubId: '42', githubLogin: 'developer', communityOptIn: true,
    githubToken: 'test-only', createdAt: new Date('2025-01-01'),
    githubStats: { ...scoreContributions([10], 0), period: current, syncedAt: new Date(), login: 'developer' } };
  await users.insertOne(user);
  const collect = async (_user, period, now) => ({ ...scoreContributions([15], 0, 0), period, syncedAt: now, login: 'developer', rulesVersion: 2 });
  try {
    await t.test('migration and repeat synchronization retain one record per month', async () => {
      await ensureLegacy(db, user); await ensureLegacy(db, user);
      await syncSeason(db, user, current, { force: true, collect });
      await syncSeason(db, user, current, { force: true, collect });
      assert.equal(await seasons.countDocuments({ githubId: '42', period: current }), 1);
      assert.equal((await careerFor(db, user)).xp, 150);
      assert.equal((await seasons.findOne({ githubId: '42', period: current })).protectedXP, 100);
    });
    await t.test('a failed API request preserves the saved snapshot and releases its lock', async () => {
      await assert.rejects(syncSeason(db, user, current, { force: true, collect: async () => { throw new Error('API unavailable'); } }));
      assert.equal((await users.findOne({ _id: user._id })).githubStats.xp, 150);
      assert.equal((await users.findOne({ _id: user._id })).syncLockId, undefined);
    });
    await t.test('concurrent writers cannot both award XP', async () => {
      let release;
      let started;
      const ready = new Promise((resolve) => { started = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      const first = syncSeason(db, user, current, { force: true, collect: async (...args) => { started(); await gate; return collect(...args); } });
      await ready;
      await assert.rejects(syncSeason(db, user, current, { force: true, collect }), (error) => error.status === 429);
      release(); await first;
      assert.equal((await careerFor(db, user)).xp, 150);
    });
    await t.test('month closure saves deterministic positions and cannot be overwritten', async () => {
      const previous = periodFor(new Date(periodBounds(current).from.getTime() - 1));
      for (const githubId of ['10', '2']) await seasons.insertOne({ githubId, period: previous, eligible: true,
        status: 'open', stats: { ...scoreContributions([5], 0), period: previous }, completeness: 'observed', reconciledAt: new Date(), updatedAt: new Date() });
      const closeTime = new Date(periodBounds(previous).end.getTime() + 49 * 3600000);
      await finalizeSeason(db, previous, closeTime);
      assert.equal((await seasons.findOne({ githubId: '10', period: previous })).position, 1);
      assert.equal((await seasons.findOne({ githubId: '2', period: previous })).position, 2);
      assert.equal((await db.collection('communitySeasonResults').findOne({ _id: previous })).status, 'closed');
      const result = await syncSeason(db, user, previous, { force: true, collect: async () => { throw new Error('must not query a closed season'); } });
      assert.equal(result.skipped, true);
      await finalizeSeason(db, previous, closeTime);
      assert.equal((await seasons.findOne({ githubId: '10', period: previous })).position, 1);
    });
    await t.test('late legacy imports do not invent a historical ranking position', async () => {
      const previous = periodFor(new Date(periodBounds(current).from.getTime() - 1));
      const late = { ...user, githubId: '99', githubStats: { ...user.githubStats, period: previous } };
      await ensureLegacy(db, late);
      const history = await seasonHistory(db, late);
      assert.equal(history[0].status, 'closed');
      assert.equal(history[0].position, null);
      assert.equal(history[0].completeness, 'partial');
    });
  } finally { await db.dropDatabase(); await client.close(); }
});
