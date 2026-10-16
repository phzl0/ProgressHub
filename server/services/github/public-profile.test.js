const test = require('node:test');
const assert = require('node:assert/strict');
const { publicProfile } = require('./public-profile');
const now = new Date('2026-10-16T12:00:00Z');
const user = {
  githubId: '42', githubLogin: 'developer', picture: 'https://avatars.githubusercontent.com/u/42',
  communityOptIn: true, email: 'private@example.com', githubToken: 'encrypted-secret',
  googleId: 'private-google-id', tasks: [{ title: 'Private task' }],
  githubStats: { period: '2026-10', xp: 200, level: 2, experience: 0, nextLevelXP: 400,
    commits: 20, mergedPRs: 0, title: 'Explorador', achievements: ['Primeiro commit'],
    syncedAt: now, commitDays: [{ date: '2026-10-16', detected: 20 }], pullRequests: [{ title: 'Not part of public summary' }] }
};
test('only consenting participants have a public profile', () => {
  assert.equal(publicProfile(null, 1, now), null);
  assert.equal(publicProfile({ ...user, communityOptIn: false }, 1, now), null);
  assert.equal(publicProfile({ ...user, githubId: 'invalid' }, 1, now), null);
});
test('public profile allowlist excludes private fields and detailed activity', () => {
  const result = publicProfile(user, 4, now);
  assert.deepEqual(Object.keys(result).sort(), ['githubId', 'login', 'picture', 'position', 'stats']);
  assert.equal(result.position, 4);
  assert.equal(result.stats.xp, 200);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(result.stats.commitDays, undefined);
  assert.equal(result.stats.pullRequests, undefined);
  assert.equal(result.githubToken, undefined);
});
test('past season stats are not presented as current progress', () => {
  const result = publicProfile({ ...user, githubStats: { ...user.githubStats, period: '2026-09' } }, 1, now);
  assert.equal(result.stats, null);
  assert.equal(result.position, null);
  assert.equal(result.login, 'developer');
});
