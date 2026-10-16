const test = require('node:test');
const assert = require('node:assert/strict');
const { periodFor, scoreContributions } = require('./scoring');

test('daily commit limits apply before monthly aggregation', () => {
  const stats = scoreContributions([25, 4], 2);
  assert.equal(stats.commits, 24);
  assert.equal(stats.xp, 340);
  assert.deepEqual(stats.breakdown, {
    commitXP: 240, pullRequestXP: 100,
    detectedCommits: 29, detectedMergedPRs: 2,
    ignoredCommits: 5, ignoredMergedPRs: 0
  });
  assert.equal(stats.level, 2);
  assert.equal(stats.experience, 140);
});
test('PR cap and XP explanation reconcile with the total', () => {
  const stats = scoreContributions([21, 30], 103);
  assert.equal(stats.mergedPRs, 100);
  assert.equal(stats.breakdown.ignoredMergedPRs, 3);
  assert.equal(stats.xp, stats.breakdown.commitXP + stats.breakdown.pullRequestXP);
  assert.equal(stats.breakdown.detectedCommits, stats.commits + stats.breakdown.ignoredCommits);
  assert.equal(stats.xp, 5400);
});
test('no activity starts at level one without achievements', () => {
  const stats = scoreContributions([], 0);
  assert.equal(stats.xp, 0);
  assert.equal(stats.level, 1);
  assert.deepEqual(stats.achievements, []);
});
test('exact level threshold and repeated snapshots do not add XP', () => {
  const first = scoreContributions([20], 0);
  assert.equal(first.level, 2);
  assert.equal(first.experience, 0);
  assert.deepEqual(scoreContributions([20], 0), first);
});
test('season boundary uses UTC rather than local calendar month', () => {
  assert.equal(periodFor(new Date('2026-10-31T22:00:00-03:00')), '2026-11');
});
