const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { encryptToken, decryptToken, collectStats } = require('./client');

process.env.GITHUB_TOKEN_KEY = 'ab'.repeat(32);
test('token encryption authenticates its contents', () => {
  const encrypted = encryptToken('local-test-token');
  assert.equal(decryptToken(encrypted), 'local-test-token');
  assert.equal(encrypted.includes('local-test-token'), false);
  const parts = encrypted.split('.');
  parts[1] = Buffer.alloc(16).toString('base64');
  assert.throws(() => decryptToken(parts.join('.')));
});
test('historical sync bounds PR search and rewards only human collaboration', async () => {
  const original = axios.create;
  let variables;
  axios.create = () => ({
    get: async () => ({ data: { id: 42, login: 'author' } }),
    post: async (_url, payload) => {
      variables = payload.variables;
      return { data: { data: {
        user: { contributionsCollection: { commitContributionsByRepository: [{ repository: { isPrivate: false }, contributions: { nodes: [{ commitCount: 3, occurredAt: '2026-09-15T00:00:00Z' }], pageInfo: { hasNextPage: false } } }] } },
        search: { issueCount: 2, nodes: ['author', 'peer'].map((login) => ({ title: 'PR', url: `https://github.com/test/repo/pull/${login}`, mergedAt: '2026-09-16T00:00:00Z', repository: { isPrivate: false, nameWithOwner: 'test/repo' }, mergedBy: { login, __typename: 'User' } })) }
      } } };
    }
  });
  try {
    const stats = await collectStats({ githubId: '42', githubToken: encryptToken('test') }, '2026-09', new Date('2026-10-16T12:00:00Z'));
    assert.equal(variables.to, '2026-09-30T23:59:59.999Z');
    assert.match(variables.search, /merged:2026-09-01\.\.2026-09-30/);
    assert.equal(stats.xp, 155);
    assert.equal(stats.breakdown.collaborationBonus, 25);
    assert.deepEqual(stats.pullRequests.map((pr) => pr.xp).sort(), [50, 75]);
  } finally { axios.create = original; }
});
