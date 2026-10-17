const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGoal, goalProgress, summarizeWeek } = require('./engagement');
test('personal goals allow only bounded server-defined metrics and quantities', () => {
  assert.deepEqual(validateGoal({ metric: 'days', target: 3, xp: 9999 }), { metric: 'days', target: 3 });
  for (const input of [{ metric: 'xp', target: 100 }, { metric: 'days', target: 8 }, { metric: 'commits', target: -1 }, { metric: 'reviews', target: 1.5 }, { metric: 'days', target: '3' }]) assert.throws(() => validateGoal(input), { status: 400 });
});
test('goal progress excludes earlier and next-week actions and counts distinct review PRs', () => {
  const goal = { metric: 'reviews', target: 2, periodKey: '2026-10-12', createdAt: '2026-10-16T12:00:00Z', endsAt: '2026-10-19T00:00:00Z' };
  const events = [
    { kind: 'review', id: 'a', prId: 'old', at: '2026-10-15T12:00:00Z' },
    { kind: 'review', id: 'b', prId: 'one', at: '2026-10-16T13:00:00Z' },
    { kind: 'review', id: 'c', prId: 'one', at: '2026-10-16T14:00:00Z' },
    { kind: 'review', id: 'd', prId: 'two', at: '2026-10-17T13:00:00Z' },
    { kind: 'review', id: 'e', prId: 'future', at: '2026-10-19T00:00:00Z' }
  ];
  const result = goalProgress(goal, events, new Date('2026-10-18T10:00:00Z'));
  assert.equal(result.current, 2); assert.equal(result.progress, 100); assert.equal(result.completedAt, '2026-10-17T13:00:00Z');
});
test('weekly summary spans months and separates action XP from bonuses received this week', () => {
  const records = [
    { period: '2026-09', stats: { detailsVersion: 2, commitDays: [{ date: '2026-09-28', credited: 2, xp: 20 }, { date: '2026-09-27', credited: 20, xp: 200 }], pullRequests: [{ url: 'pr1', mergedAt: '2026-09-30T12:00:00Z', xp: 75 }] } },
    { period: '2026-10', stats: { detailsVersion: 2, commitDays: [{ date: '2026-10-01', credited: 3, xp: 30 }], pullRequests: [{ url: 'pr2', mergedAt: '2026-10-02T12:00:00Z', xp: 50 }] } }
  ];
  const rewards = [{ awardedAt: new Date('2026-10-01T12:00:00Z'), xp: 300 }, { awardedAt: new Date('2026-09-27T12:00:00Z'), xp: 500 }];
  const result = summarizeWeek(records, rewards, [], new Date('2026-10-03T12:00:00Z'));
  assert.equal(result.xp, 475); assert.equal(result.bonusXP, 300); assert.equal(result.commits, 5); assert.equal(result.activeDays, 2); assert.equal(result.mergedPRs, 2); assert.equal(result.receivedMissions, 1); assert.equal(result.partial, false);
  assert.equal(summarizeWeek(records.slice(1), rewards, [], new Date('2026-10-03T12:00:00Z')).partial, true);
});
test('weekly summary counts achievement bonuses at receipt time without treating them as missions', () => {
  const now=new Date('2026-10-17T12:00:00Z');
  const summary=summarizeWeek([], [{xp:300,awardedAt:now}], [], now, [{xp:1000,awardedAt:now}], [
    {xp:500,awardedAt:now}, {xp:2000,awardedAt:new Date('2026-10-10T12:00:00Z')}
  ]);
  assert.equal(summary.achievementBonusXP,500);assert.equal(summary.bonusXP,1800);
  assert.equal(summary.xp,1800);assert.equal(summary.receivedMissions,1);
});
