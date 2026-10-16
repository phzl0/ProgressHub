const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { collectMissionEvents, MAIN_QUERY, REPO_QUERY } = require('./github');
const { encryptToken } = require('../github/client');
process.env.GITHUB_TOKEN_KEY = 'cd'.repeat(32);
test('GitHub collector excludes inherited commits, self-reviews and manually closed issues', async () => {
  const original = axios.create;
  const pr = { id: 'pr1', url: 'https://github.com/user/project/pull/1', createdAt: '2026-10-16T12:30:00Z', mergedAt: '2026-10-16T13:00:00Z', isDraft: false, additions: 1, deletions: 0, author: { login: 'user' }, repository: { nameWithOwner: 'user/project', isPrivate: false }, mergeCommit: { oid: 'merged' }, mergedBy: { login: 'peer', __typename: 'User' }, closingIssuesReferences: { nodes: [{ closed: true, repository: { isPrivate: false }, timelineItems: { nodes: [{ closer: null }] } }], pageInfo: { hasNextPage: false } } };
  const review = (id, author) => ({ pullRequest: { id, author: { login: author }, repository: pr.repository }, pullRequestReview: { id: `review-${id}`, submittedAt: '2026-10-16T14:00:00Z', state: 'APPROVED' } });
  const commit = (oid, at) => ({ oid, authoredDate: at, committedDate: at, additions: 1, deletions: 0, parents: { totalCount: 1 } });
  axios.create = () => ({
    get: async () => ({ data: { id: 42, login: 'user', node_id: 'USER_NODE' } }),
    post: async (_url, { query }) => {
      if (query === MAIN_QUERY) return { data: { data: { user: { contributionsCollection: { commitContributionsByRepository: [{ repository: pr.repository }], pullRequestReviewContributions: { nodes: [review('self', 'user'), review('peer', 'someone')], pageInfo: { hasNextPage: false } } } }, opened: { nodes: [pr], issueCount: 1 }, merged: { nodes: [pr], issueCount: 1 } } } };
      assert.equal(query, REPO_QUERY);
      return { data: { data: { repository: { isPrivate: false, defaultBranchRef: { target: { history: { nodes: [commit('inherited', '2026-10-01T12:00:00Z'), commit('new', '2026-10-16T13:00:00Z')], pageInfo: { hasNextPage: false } } } }, releases: { nodes: [], pageInfo: { hasNextPage: false } } } } } };
    }
  });
  try {
    const data = await collectMissionEvents({ githubId: '42', githubToken: encryptToken('test'), missionsStartedAt: '2026-10-16T12:00:00Z' }, new Date('2026-10-16T15:00:00Z'));
    assert.deepEqual(data.events.filter((event) => event.kind === 'commit').map((event) => event.id), ['new']);
    assert.equal(data.events.filter((event) => event.kind === 'review').length, 1);
    assert.equal(data.events.find((event) => event.kind === 'merged').issueClosed, false);
    assert.equal(data.events.find((event) => event.kind === 'merged').collaborative, true);
  } finally { axios.create = original; }
});
