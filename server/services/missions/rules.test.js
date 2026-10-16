const test = require('node:test');
const assert = require('node:assert/strict');
const { definitions, activeMissions, claimCandidates, windowFor } = require('./rules');
const { addMissionBonus } = require('./store');
const { scoreContributions } = require('../github/scoring');
const started = '2026-10-01T00:00:00.000Z';
const now = new Date('2026-10-28T20:00:00Z');
const event = (kind, id, at, extra = {}) => ({ kind, id, at, repo: 'user/project', ...extra });

test('catalogue contains exactly five numbered missions per frequency and approved bonuses', () => {
  assert.equal(definitions.length, 15);
  for (const kind of ['daily', 'weekly', 'monthly']) assert.deepEqual(definitions.filter((mission) => mission.kind === kind).map((mission) => mission.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(definitions.filter((mission) => mission.kind === 'daily').map((mission) => mission.xp), [300, 300, 500, 300, 500]);
  assert.deepEqual(definitions.filter((mission) => mission.kind === 'monthly').map((mission) => mission.xp), [2000, 2000, 3000, 3000, 5000]);
});
test('daily objectives use evidence after activation and UTC boundaries', () => {
  const events = [event('commit', 'old', '2026-10-28T01:00:00.000Z'), event('commit', 'fresh', '2026-10-28T13:00:00.000Z'), event('opened', 'pr', '2026-10-28T14:00:00.000Z'), event('merged', 'pr', '2026-10-28T15:00:00.000Z', { issueClosed: true }), event('review', 'review', '2026-10-28T16:00:00.000Z', { prId: 'peer-pr' })];
  const daily = activeMissions(events, '2026-10-28T12:00:00Z', now).filter((mission) => mission.kind === 'daily');
  assert.equal(daily.every((mission) => mission.completedAt), true);
  assert.equal(daily[0].requirements[0].current, 1);
  const previous = activeMissions([event('commit', 'old', '2026-10-28T01:00:00Z')], '2026-10-28T12:00:00Z', now);
  assert.equal(previous[0].completedAt, null);
  assert.equal(windowFor('weekly', new Date('2026-11-01T23:00:00Z')).key, '2026-10-26');
  assert.equal(windowFor('weekly', new Date('2026-11-02T00:00:00Z')).key, '2026-11-02');
});
test('ten commits in a single day do not complete the two-day weekly objective', () => {
  const events = Array.from({ length: 10 }, (_, i) => event('commit', String(i), '2026-10-28T12:00:00.000Z'));
  const mission = activeMissions(events, started, now).find((item) => item.id === 'weekly-2');
  assert.equal(mission.completedAt, null);
  assert.equal(mission.requirements[1].current, 1);
});
test('reviews count distinct PRs, not repeated reviews of one PR', () => {
  const events = Array.from({ length: 3 }, (_, i) => event('review', String(i), '2026-10-28T12:00:00.000Z', { prId: 'same-pr' }));
  assert.equal(activeMissions(events, started, now).find((item) => item.id === 'weekly-4').completedAt, null);
});
test('monthly collaboration requires both quantity and repository diversity', () => {
  const events = Array.from({ length: 4 }, (_, i) => event('merged', String(i), '2026-10-28T12:00:00.000Z', { collaborative: true }));
  assert.equal(activeMissions(events, started, now).find((item) => item.id === 'monthly-4').completedAt, null);
  events[3].repo = 'peer/other';
  assert.ok(activeMissions(events, started, now).find((item) => item.id === 'monthly-4').completedAt);
});
test('release objective requires own commits, PRs and files in that same published version', () => {
  const commits = Array.from({ length: 20 }, (_, i) => event('commit', `c${i}`, `2026-10-${String(10 + i % 5).padStart(2, '0')}T12:00:00.000Z`));
  const prs = Array.from({ length: 5 }, (_, i) => event('merged', `p${i}`, '2026-10-16T12:00:00.000Z'));
  const release = event('release', 'release1', '2026-10-20T12:00:00.000Z', { commitIds: commits.map((item) => item.id), prIds: prs.map((item) => item.id), readme: true, implementation: true });
  const evaluate = (candidate) => activeMissions([...commits, ...prs, candidate], started, now).find((item) => item.id === 'monthly-5');
  assert.ok(evaluate(release).completedAt);
  assert.equal(evaluate({ ...release, commitIds: [] }).completedAt, null);
  assert.equal(evaluate({ ...release, prIds: ['p1'] }).completedAt, null);
  assert.equal(evaluate({ ...release, readme: false }).completedAt, null);
  assert.equal(evaluate({ ...release, implementation: false }).completedAt, null);
});
test('a single contribution can complete multiple frequencies but expired rewards are not retroactive', () => {
  const events = Array.from({ length: 12 }, (_, i) => event('commit', String(i), `2026-10-${String(1 + i).padStart(2, '0')}T12:00:00.000Z`));
  const claims = claimCandidates(events, started, now);
  assert.ok(claims.find((item) => item.id === 'monthly-1'));
  assert.equal(claims.some((item) => item.kind === 'daily'), false);
});
test('bonus reconciliation replaces the total and remains separate from normal action XP', () => {
  const base = scoreContributions([5], 0);
  const rewarded = addMissionBonus(base, 300);
  assert.equal(rewarded.xp, 350);
  assert.equal(rewarded.baseXP, 50);
  assert.equal(addMissionBonus(rewarded, 300).xp, 350);
  assert.equal(addMissionBonus(rewarded, 800).xp, 850);
});
