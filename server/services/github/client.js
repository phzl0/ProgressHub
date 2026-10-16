const axios = require('axios');
const crypto = require('crypto');
const { scoreContributions } = require('./scoring');

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
  const from = `${period}-01T00:00:00Z`;
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
    search(query: $search, type: ISSUE, first: 1) { issueCount }
  }`;
  const { data } = await client.post('/graphql', { query, variables: {
    login: profile.login, from, to: now.toISOString(),
    search: `is:pr is:merged is:public author:${profile.login} merged:>=${period}-01`
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
  return {
    ...scoreContributions(Object.values(days), data.data.search.issueCount),
    period, syncedAt: now, rulesVersion: 1,
    login: profile.login
  };
}
module.exports = { tokenKey, encryptToken, decryptToken, githubClient, collectStats };
