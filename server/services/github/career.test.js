const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCareer, preserveLegacy } = require('./career');
const { scoreContributions } = require('./scoring');

test('season rollover retains XP, levels and achievements', () => {
  const closed = { period: '2026-09', status: 'closed', position: 3, stats: scoreContributions([20, 20], 4) };
  const current = { period: '2026-10', status: 'open', stats: scoreContributions([], 0) };
  const before = summarizeCareer([closed]);
  const after = summarizeCareer([closed, current]);
  assert.equal(after.xp, before.xp);
  assert.equal(after.level, before.level);
  assert.deepEqual(after.achievements, before.achievements);
  assert.equal(after.bestPosition, 3);
});
test('repeated snapshots are replacements for a month, not additional XP', () => {
  const old = { period: '2026-10', stats: scoreContributions([5], 0) };
  const updated = { period: '2026-10', stats: scoreContributions([8], 0) };
  assert.equal(summarizeCareer([old, updated]).xp, 80);
  assert.equal(summarizeCareer([updated, updated]).xp, 80);
});
test('legacy minimum is preserved and the breakdown reconciles', () => {
  const stats = preserveLegacy(scoreContributions([2], 0), 100);
  assert.equal(stats.xp, 100);
  assert.equal(stats.breakdown.legacyAdjustment, 80);
  assert.equal(stats.xp, stats.breakdown.commitXP + stats.breakdown.pullRequestXP + stats.breakdown.legacyAdjustment);
  assert.equal(preserveLegacy(scoreContributions([15], 0), 100).xp, 150);
});

test('unlocked career achievements survive corrections to the current snapshot', () => {
  const career = summarizeCareer([{ period: '2026-10', stats: scoreContributions([], 0) }], ['Primeiro PR mesclado']);
  assert.deepEqual(career.achievements, ['Primeiro PR mesclado']);
});
