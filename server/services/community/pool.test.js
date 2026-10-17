const test = require('node:test');
const assert = require('node:assert/strict');
const { shareXP, POOL_XP, GRACE } = require('./pool');
const { addMissionBonus } = require('../missions/store');
test('pool shares are proportional and equal contributions have equal integer rewards', () => {
  assert.equal(POOL_XP, 40000); assert.equal(GRACE, 48 * 3600000);
  assert.deepEqual([50, 30, 20].map(count => shareXP(count, 100)), [20000, 12000, 8000]);
  assert.equal(shareXP(100, 100), 40000); assert.equal(shareXP(0, 0), 0);
  assert.deepEqual([1, 1, 1].map(count => shareXP(count, 3)), [13333, 13333, 13333]);
});
test('pool XP remains separate and survives repeated mission reward reconciliation', () => {
  const base = { xp: 50, breakdown: { commitXP: 50 } };
  const stats = addMissionBonus(base, 300, 20000);
  assert.equal(stats.xp, 20350); assert.equal(stats.baseXP, 50); assert.equal(stats.communityXP, 20000);
  assert.equal(addMissionBonus(stats, 300).xp, 20350); assert.equal(addMissionBonus(stats, 800).xp, 20850);
});
