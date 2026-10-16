const axios = require('axios');
const crypto = require('crypto');
const { RULES_VERSION, periodBounds, collaborativePR, scoreContributions } = require('./scoring');

function tokenKey() {
  const value = process.env.GITHUB_TOKEN_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('GitHub token key is not configured');
  return Buffer.from(value, 'hex');
}
function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}
function decryptToken(value) {
  const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
function githubClient(token) {
  return axios.create({
    baseURL: 'https://api.github.com', timeout: 20000,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'QuestLog-Community' }
  });
}
async function collectStats(user, period, now = new Date()) {
  const client = githubClient(decryptToken(user.githubToken));
  const bounds = periodBounds(period);
  const from = bounds.from.toISOString();
  const to = new Date(Math.min(now.getTime(), bounds.end.getTime() - 1));
  if (to < bounds.from) throw new Error('Future season');
  // Revalidate identity: names can change, numeric IDs cannot.
  const { data: profile } = await client.get('/user');
  if (String(profile.id) !== user.githubId) throw new Error('GitHub identity mismatch');
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!, $search: String!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { isPrivate }
          contributions(first: 100) { nodes { commitCount occurredAt } pageInfo { hasNextPage } }
        }
      }
    }
    search(query: $search, type: ISSUE, first: 100) {
      issueCount
      nodes { ... on PullRequest { title url mergedAt mergedBy { login __typename } repository { nameWithOwner isPrivate } } }
    }
  }`;
  const { data } = await client.post('/graphql', { query, variables: {
    login: profile.login, from, to: to.toISOString(),
    search: `is:pr is:merged is:public author:${profile.login} merged:${period}-01..${to.toISOString().slice(0, 10)} sort:created-asc`
  } });
  if (data.errors || !data.data?.user) throw new Error('GitHub returned incomplete contribution data');
  const repos = data.data.user.contributionsCollection.commitContributionsByRepository;
  // Avoid publishing an apparently complete score when the API reaches its repository cap.
  if (repos.length >= 100 || repos.some((repo) => repo.contributions.pageInfo.hasNextPage)) {
    throw new Error('Contribution volume exceeds MVP import limit');
  }
  const days = {};
  for (const repo of repos) {
    if (repo.repository.isPrivate) continue;
    for (const contribution of repo.contributions.nodes) {
      const day = contribution.occurredAt.slice(0, 10);
      days[day] = (days[day] || 0) + contribution.commitCount;
    }
  }
  const pullRequests = data.data.search.nodes
    .filter((pr) => pr?.mergedAt && pr.repository && !pr.repository.isPrivate)
    .map((pr) => ({ title: pr.title, url: pr.url, mergedAt: pr.mergedAt,
      repository: pr.repository.nameWithOwner, mergedBy: pr.mergedBy?.login || null,
      mergerType: pr.mergedBy?.__typename || null }));
  if (pullRequests.length !== Math.min(100, data.data.search.issueCount)) throw new Error('Incomplete PR search results');
  const collaborationCount = pullRequests.filter((pr) => collaborativePR(pr, profile.login)).length;
  return {
    ...scoreContributions(Object.values(days), data.data.search.issueCount, collaborationCount),
    commitDays: Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([date, count]) => ({
      date, detected: count, credited: Math.min(20, count), xp: Math.min(20, count) * 10
    })),
    pullRequests: pullRequests.map((pr) => ({ ...pr, xp: collaborativePR(pr, profile.login) ? 75 : 50 }))
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)),
    period, syncedAt: now, rulesVersion: RULES_VERSION, detailsVersion: 2,
    login: profile.login
  };
}
module.exports = { tokenKey, encryptToken, decryptToken, githubClient, collectStats };
