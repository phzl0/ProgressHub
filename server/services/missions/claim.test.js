const test = require('node:test');
const assert = require('node:assert/strict');
const { claimMission } = require('./store');
const { periodFor } = require('../github/scoring');
const now = new Date('2026-10-17T12:00:00Z');
// Small persistence double: exercises server validation and the reward ledger without GitHub calls.
function database({ complete = true, locked = false } = {}) {
  const user = { _id: 'user', githubId: '42', missionsStartedAt: new Date('2026-10-17T00:00:00Z') };
  const rewards = [];
  const achievements = [];
  const events = complete ? [{ kind: 'commit', id: 'sha', at: now.toISOString() }] : [];
  const season = { githubId: '42', period: periodFor(now), status: 'open', stats: { xp: 50, baseXP: 50, achievements: [], commits: 5, mergedPRs: 0 } };
  const cursor = data => ({ toArray: async () => data, sort() { return this; }, limit() { return this; } });
  const collections = {
    users: {
      findOne: async () => user,
      updateOne: async (filter, update) => {
        if (update.$set?.syncLockId && locked) return { modifiedCount: 0 };
        Object.assign(user, update.$set || {});
        for (const key of Object.keys(update.$unset || {})) delete user[key];
        return { modifiedCount: 1 };
      }
    },
    achievementRewards: {
      find: filter => cursor(achievements.filter(r => (!filter.creditedPeriod || r.creditedPeriod === filter.creditedPeriod) && (!filter.status || r.status === filter.status))),
      updateOne: async (filter, update) => {
        const existing = achievements.find(r => r._id === filter._id);
        if (existing) { Object.assign(existing, update.$set || {}); return { upsertedCount: 0 }; }
        achievements.push({ _id: filter._id, ...update.$setOnInsert }); return { upsertedCount: 1 };
      }
    },
    communityPoolShares: { find: () => cursor([]) },
    missionEvents: { find: () => cursor(events) },
    missionRewards: {
      findOne: async filter => rewards.find(r => r._id === filter._id),
      find: filter => cursor(rewards.filter(r => !filter.creditedPeriod || r.creditedPeriod === filter.creditedPeriod)),
      insertOne: async reward => { rewards.push(reward); }
    },
    communitySeasons: {
      find: () => cursor([season]), findOne: async () => season,
      updateOne: async (filter, update) => { if (update.$set) Object.assign(season, update.$set); }
    },
    communitySeasonResults: { findOne: async () => null }
  };
  return { db: { collection: name => collections[name] }, user, rewards, season };
}
test('claim pays the mission and eligible achievement bonuses once and refreshes permanent career', async () => {
  const { db, user, rewards, season } = database();
  const first = await claimMission(db, user, 'daily-1', '2026-10-17', now);
  assert.equal(first.missions.find(m => m.id === 'daily-1').progress, 100);
  assert.equal(first.missions.find(m => m.id === 'daily-1').awarded, true);
  await claimMission(db, user, 'daily-1', '2026-10-17', now);
  assert.equal(rewards.length, 1);
  assert.equal(season.stats.xp, 950);
  assert.equal(user.career.xp, 950);
  assert.equal(user.syncLockId, undefined);
});
test('incomplete and expired objectives cannot be claimed and release the account lock', async () => {
  const { db, user, rewards } = database({ complete: false });
  await assert.rejects(claimMission(db, user, 'daily-1', '2026-10-17', now), { status: 409 });
  await assert.rejects(claimMission(db, user, 'daily-1', '2026-09-01', now), { status: 409 });
  assert.equal(rewards.length, 0);
  assert.equal(user.syncLockId, undefined);
});
test('claim rejects malformed identifiers and active sync leases', async () => {
  const { db, user } = database({ locked: true });
  await assert.rejects(claimMission(db, user, {}, '2026-10-17', now), { status: 400 });
  await assert.rejects(claimMission(db, user, 'daily-1', '2026-10-17', now), { status: 409 });
});
