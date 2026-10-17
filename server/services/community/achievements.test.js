const test = require('node:test');
const assert = require('node:assert/strict');
const { ACHIEVEMENTS, achievementMetrics } = require('./achievements');
const { addMissionBonus } = require('../missions/store');
const { scoreContributions } = require('../github/scoring');
test('38 permanent milestones have unique identities and explicit bounded bonus amounts', () => {
  assert.equal(ACHIEVEMENTS.length, 38);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 38);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.name)).size, 38);
  assert.ok(ACHIEVEMENTS.every(a => a.target > 0 && a.xp >= 300 && a.xp <= 5000));
});
test('career milestones use distinct UTC days, distinct other PR reviews and verified releases', () => {
  const metrics = achievementMetrics([
    { period: '2026-09', stats: { commits: 9 } },
    { period: '2026-09', stats: { commits: 10, mergedPRs: 2, xp: 200, commitDays: [{ date: '2026-09-01', credited: 10 }] } },
    { period: '2026-10', stats: { commits: 2, xp: 20, commitDays: [{ date: '2026-10-01', credited: 2 }, { date: '2026-10-02', credited: 0 }] } },
    { period: '2026-11', stats: { xp: 1000 } }
  ], [
    { kind: 'review', id: 'a', prId: 'pr1', at: '2026-10-02' },
    { kind: 'review', id: 'b', prId: 'pr1', at: '2026-10-03' },
    { kind: 'review', id: 'c', prId: 'pr2', at: '2027-01-01' },
    { kind: 'release', id: 'unverified', at: '2026-10-03' },
    { kind: 'release', id: 'verified', at: '2026-10-03', readme: true, implementation: true, commitIds: Array.from({length:20},(_,i)=>i), prIds: [1,2,3,4,5] }
  ], [{_id:'m1'}, {_id:'m1'}, {_id:'m2'}], new Date('2026-12-01'));
  assert.equal(metrics.commits, 12); assert.equal(metrics.days, 2); assert.equal(metrics.reviews, 1);
  assert.equal(metrics.releases, 1); assert.equal(metrics.missions, 2); assert.equal(metrics.seasons, 2);
});
test('achievement bonus is separate, repeat reconciliation replaces it and base actions stay intact', () => {
  const base = scoreContributions([5], 0);
  const rewarded = addMissionBonus(base, 300, 1000, 600);
  assert.equal(rewarded.xp, 1950); assert.equal(rewarded.baseXP, 50);
  assert.equal(addMissionBonus(rewarded, 300).xp, 1950);
  assert.equal(addMissionBonus(rewarded, 800).xp, 2450);
  assert.equal(rewarded.breakdown.achievementXP, 600);
});
