const { decryptToken, githubClient } = require('../github/client');
const { windowFor } = require('./rules');
const PR_FIELDS = `id url createdAt mergedAt isDraft additions deletions author { login }
  mergeCommit { oid } mergedBy { login __typename } repository { nameWithOwner isPrivate }
  closingIssuesReferences(first: 10) { pageInfo { hasNextPage } nodes { closed repository { isPrivate }
    timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) { nodes { ... on ClosedEvent { closer { ... on PullRequest { id } } } } }
  } }`;
const MAIN_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!, $opened: String!, $merged: String!) {
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner isPrivate } }
    pullRequestReviewContributions(first: 100) { pageInfo { hasNextPage } nodes {
      pullRequest { id author { login } repository { nameWithOwner isPrivate } }
      pullRequestReview { id submittedAt state }
    } }
  } }
  opened: search(query: $opened, type: ISSUE, first: 100) { issueCount nodes { ... on PullRequest { ${PR_FIELDS} } } }
  merged: search(query: $merged, type: ISSUE, first: 100) { issueCount nodes { ... on PullRequest { ${PR_FIELDS} } } }
}`;
const COMMIT_FIELDS = 'oid authoredDate committedDate additions deletions parents(first: 1) { totalCount }';
const REPO_QUERY = `query($owner: String!, $name: String!, $author: ID!, $since: GitTimestamp!, $until: GitTimestamp!) {
  repository(owner: $owner, name: $name) {
    isPrivate
    defaultBranchRef { target { ... on Commit { history(first: 100, since: $since, until: $until, author: { id: $author }) {
      pageInfo { hasNextPage } nodes { ${COMMIT_FIELDS} }
    } } } }
    releases(first: 3, orderBy: { field: CREATED_AT, direction: DESC }) { pageInfo { hasNextPage } nodes {
      id tagName isDraft isPrerelease publishedAt author { login }
      tagCommit { oid history(first: 100, since: $since, until: $until, author: { id: $author }) { pageInfo { hasNextPage } nodes { ${COMMIT_FIELDS} } } }
    } }
  }
}`;
const validCommit = (commit, start, end) => new Date(commit.authoredDate) >= start && new Date(commit.authoredDate) <= end && new Date(commit.committedDate) >= start && new Date(commit.committedDate) <= end && commit.parents.totalCount <= 1 && commit.additions + commit.deletions > 0;
const iso = (date) => new Date(date).toISOString();
async function collectMissionEvents(user, now = new Date()) {
  const deadline = Date.now() + 70000;
  const options = () => { const timeout = Math.min(15000, deadline - Date.now()); if (timeout <= 0) throw new Error('Mission scan time budget reached'); return { timeout }; };
  const client = githubClient(decryptToken(user.githubToken));
  const events = [];
  let partial = false;
  const started = new Date(user.missionsStartedAt);
  let start = new Date(Math.min(windowFor('monthly', now).start, windowFor('weekly', now).start));
  if (now.getUTCDate() <= 2) start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  if (start < started) start = started;
  if (start > now) return { events, partial };
  const { data: profile } = await client.get('/user', options());
  if (String(profile.id) !== user.githubId) throw new Error('GitHub identity mismatch');
  const login = profile.login;
  const range = `${start.toISOString().slice(0, 10)}..${now.toISOString().slice(0, 10)}`;
  const { data: response } = await client.post('/graphql', { query: MAIN_QUERY, variables: {
    login, from: start.toISOString(), to: now.toISOString(),
    opened: `is:pr is:public author:${login} created:${range} sort:created-desc`,
    merged: `is:pr is:merged is:public author:${login} merged:${range} sort:updated-desc`
  } }, options());
  if (response.errors || !response.data?.user) throw new Error('Incomplete mission data');
  const data = response.data;
  for (const pr of data.opened.nodes) {
    if (!pr?.id || pr.repository.isPrivate || pr.isDraft || pr.author?.login.toLowerCase() !== login.toLowerCase() || pr.additions + pr.deletions <= 0) continue;
    events.push({ kind: 'opened', id: pr.id, repo: pr.repository.nameWithOwner, at: iso(pr.createdAt), url: pr.url });
  }
  const mergedPRs = data.merged.nodes.filter((pr) => pr?.id && !pr.repository.isPrivate && pr.author?.login.toLowerCase() === login.toLowerCase() && pr.mergedAt && pr.additions + pr.deletions > 0);
  for (const pr of mergedPRs) {
    const issueClosed = pr.closingIssuesReferences.nodes.some((issue) => issue?.closed && !issue.repository.isPrivate && issue.timelineItems.nodes.some((event) => event.closer?.id === pr.id));
    events.push({ kind: 'merged', id: pr.id, repo: pr.repository.nameWithOwner, at: iso(pr.mergedAt), url: pr.url,
      mergeCommit: pr.mergeCommit?.oid || null, collaborative: pr.mergedBy?.__typename === 'User' && pr.mergedBy.login.toLowerCase() !== login.toLowerCase(), issueClosed });
  }
  const referencesPartial = mergedPRs.some((pr) => pr.closingIssuesReferences.pageInfo?.hasNextPage);
  const contributions = data.user.contributionsCollection;
  for (const contribution of contributions.pullRequestReviewContributions.nodes) {
    const { pullRequest: pr, pullRequestReview: review } = contribution;
    if (pr.repository.isPrivate || !pr.author || pr.author.login.toLowerCase() === login.toLowerCase() || !review.submittedAt || review.state === 'PENDING') continue;
    events.push({ kind: 'review', id: review.id, prId: pr.id, repo: pr.repository.nameWithOwner, at: iso(review.submittedAt) });
  }
  const repoNames = [...new Set(contributions.commitContributionsByRepository.filter((entry) => !entry.repository.isPrivate).map((entry) => entry.repository.nameWithOwner))];
  partial = referencesPartial || repoNames.length > 24 || data.opened.issueCount > 100 || data.merged.issueCount > 100 || contributions.pullRequestReviewContributions.pageInfo.hasNextPage;
  const repoData = [];
  let next = 0;
  async function scan() {
    while (next < Math.min(24, repoNames.length)) {
      const repo = repoNames[next++];
      try {
        const [owner, name] = repo.split('/');
        const { data: result } = await client.post('/graphql', { query: REPO_QUERY, variables: { owner, name, author: profile.node_id, since: start.toISOString(), until: now.toISOString() } }, options());
        if (result.errors || !result.data?.repository || result.data.repository.isPrivate) throw new Error('Repository unavailable');
        const repository = result.data.repository;
        const history = repository.defaultBranchRef?.target?.history;
        if (!history) continue;
        if (history.pageInfo.hasNextPage || repository.releases.pageInfo?.hasNextPage) partial = true;
        for (const commit of history.nodes.filter((node) => validCommit(node, start, now))) events.push({ kind: 'commit', id: commit.oid, repo, at: iso(commit.authoredDate) });
        repoData.push({ repo, repository });
      } catch (_) { partial = true; }
    }
  }
  await Promise.all([scan(), scan(), scan()]);
  for (const { repo, repository } of repoData) {
    const commits = events.filter((event) => event.kind === 'commit' && event.repo === repo);
    const prs = events.filter((event) => event.kind === 'merged' && event.repo === repo);
    if (commits.length < 20 || prs.length < 5) continue;
    for (const release of repository.releases.nodes.filter(Boolean)) {
      if (release.isDraft || release.isPrerelease || !release.publishedAt || new Date(release.publishedAt) < start || new Date(release.publishedAt) > now || release.author?.login.toLowerCase() !== login.toLowerCase() || !release.tagCommit) continue;
      if (release.tagCommit.history.pageInfo?.hasNextPage) partial = true;
      const included = release.tagCommit.history.nodes.filter((commit) => validCommit(commit, start, new Date(release.publishedAt))).map((commit) => commit.oid);
      const commitIds = commits.filter((event) => included.includes(event.id) && event.at <= iso(release.publishedAt)).map((event) => event.id);
      if (commitIds.length < 20) continue;
      try {
        const { data: tree } = await client.get(`/repos/${repo}/git/trees/${release.tagCommit.oid}?recursive=1`, options());
        if (tree.truncated) { partial = true; continue; }
        const readme = tree.tree.find((file) => file.type === 'blob' && /^readme(?:\.(?:md|rst|txt))?$/i.test(file.path) && file.size > 0);
        // Presence and non-zero bytes are objective; no semantic quality claim is made.
        const hasReadme = Boolean(readme);
        const implementation = tree.tree.some((file) => file.type === 'blob' && file.size > 0 && !/(^|\/)(node_modules|vendor|dist|build|coverage|docs|assets|images|\.git)(\/|$)/i.test(file.path) && !/\.min\./i.test(file.path) && /\.(js|jsx|ts|tsx|py|java|go|rs|c|cpp|h|cs|rb|php|swift|kt|dart|vue|svelte|html|css|sql|sh)$/i.test(file.path));
        const prIds = [];
        const candidates = prs.filter((event) => event.mergeCommit && event.at <= iso(release.publishedAt));
        if (candidates.length > 20) partial = true;
        for (const pr of candidates.slice(0, 20)) {
          if (prIds.length >= 5) break;
          const { data: comparison } = await client.get(`/repos/${repo}/compare/${pr.mergeCommit}...${release.tagCommit.oid}`, options());
          if (['ahead', 'identical'].includes(comparison.status)) prIds.push(pr.id);
        }
        events.push({ kind: 'release', id: release.id, repo, at: iso(release.publishedAt), commitIds, prIds, readme: hasReadme, implementation });
      } catch (_) { partial = true; }
    }
  }
  return { events: events.filter((event) => new Date(event.at) >= started && new Date(event.at) <= now), partial };
}
module.exports = { collectMissionEvents, MAIN_QUERY, REPO_QUERY };
