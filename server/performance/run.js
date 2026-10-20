// Isolated benchmark harness. Never imported by server.js or production routes.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const os = require('node:os');
const fs = require('node:fs');
const { MongoClient, ObjectId, BSON } = require('mongodb');
const express = require('express');

function options(env = process.env) {
  const uri = env.MONGODB_PERF_URI;
  if (!uri) throw new Error('Set MONGODB_PERF_URI to an isolated local MongoDB instance.');
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || !['', '/'].includes(parsed.pathname)) throw new Error('Only a loopback URI without database/credentials/options is supported.');
  const users = Number(env.PERF_USERS || 1000);
  if (!Number.isInteger(users) || users < 100 || users > 5000) throw new Error('PERF_USERS must be 100..5000.');
  const label = env.PERF_LABEL || 'current';
  if (!/^[a-z0-9-]{1,40}$/.test(label)) throw new Error('Invalid report label.');
  const baselineRef = env.PERF_BASELINE_REF;
  if (baselineRef && !/^[a-f0-9]{40}$/.test(baselineRef)) throw new Error('Invalid baseline commit.');
  return { uri, users, label, baselineRef };
}

async function seed(db, count) {
  const { periodFor, progression } = require('../services/github/scoring');
  const period = periodFor();
  const users = Array.from({ length: count }, (_, i) => ({ _id: new ObjectId(), githubId: String(100000 + i), githubLogin: `fixture-${i}`, communityOptIn: true,
    name: `Synthetic developer ${i}`, githubToken: 'synthetic-private-token',
    githubStats: { period, xp: 500 + i % 50, ...progression(500 + i % 50), commits: 50, mergedPRs: 1 },
    createdAt: new Date('2025-01-01') }));
  await db.collection('users').insertMany(users);
  const periods = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${period}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i); return periodFor(d); });
  for (let start = 0; start < count; start += 100) {
    const rows = users.slice(start, start + 100).flatMap(user => periods.map(p => ({ githubId: user.githubId, period: p, status: 'open', eligible: true, stats: {
      period: p, xp: user.githubStats.xp, commits: 50, mergedPRs: 20, achievements: ['Primeiro commit'],
      commitDays: Array.from({ length: 28 }, (_, d) => ({ date: `${p}-${String(d + 1).padStart(2, '0')}`, detected: 3, credited: 3, xp: 30 })),
      pullRequests: Array.from({ length: 20 }, (_, n) => ({ title: `Synthetic pull request ${n}: ${'implementation '.repeat(8)}`, url: `https://github.com/fixture/project/pull/${n}`, repository: 'fixture/project', mergedAt: `${p}-15T12:00:00Z`, xp: 50 }))
    }})));
    await db.collection('communitySeasons').insertMany(rows);
  }
  const posts = Array.from({ length: 5000 }, (_, i) => ({ _id: new ObjectId(), githubId: users[i % count].githubId, text: `Synthetic publication ${i}`, kind: 'feed', createdAt: new Date() }));
  await db.collection('communityPosts').insertMany(posts);
  const latest = posts.slice(-20);
  for (let batch = 0; batch < 5; batch++) {
    await db.collection('communityComments').insertMany(Array.from({ length: 5000 }, (_, i) => ({ _id: new ObjectId(), postId: posts[(i + batch * 5000) % posts.length]._id.toHexString(), githubId: users[i % count].githubId, text: 'Synthetic comment', createdAt: new Date() })));
    await db.collection('communityMessages').insertMany(Array.from({ length: 5000 }, (_, i) => ({ _id: new ObjectId(), channel: 'general', githubId: users[i % count].githubId, text: 'Synthetic general message', createdAt: new Date() })));
  }
  // A hot page: 20 posts with 1,000 reactions each. No private data in fixtures.
  for (const post of latest) await db.collection('communityLikes').insertMany(users.slice(0, 1000).map((u, i) => ({ _id: `${post._id}:${u.githubId}`, postId: post._id.toHexString(), githubId: u.githubId, reaction: ['heart', 'like', 'laugh', 'sad'][i % 4] })));
  const group = { _id: new ObjectId(), owner: users[0].githubId, members: users.slice(0, 50).map(u => u.githubId), invited: [], name: 'Synthetic group', type: 'group' };
  await db.collection('communityGroups').insertOne(group);
  await db.collection('communityMessages').insertMany(Array.from({ length: 300 }, (_, i) => ({ _id: new ObjectId(), channel: `group:${group._id}`, githubId: users[i % count].githubId, text: 'Synthetic group message', createdAt: new Date() })));
  for (const [name, keys, extra] of [
    ['users', { githubId: 1 }, { unique: true }], ['users', { 'githubStats.period': 1, 'githubStats.xp': -1, githubId: 1 }],
    ['communitySeasons', { githubId: 1, period: 1 }, { unique: true }], ['communityComments', { postId: 1, createdAt: -1, _id: -1 }],
    ['communityLikes', { postId: 1 }], ['communityMessages', { channel: 1, _id: -1 }],
    ['communityBlocks', { githubId: 1, blockedId: 1 }], ['communityReactions', { kind: 1, targetId: 1, githubId: 1 }]
  ]) await db.collection(name).createIndex(keys, extra || {});
  return { users, group, dimensions: { users: count, seasons: count * 12, posts: 5000, comments: 25000, messages: 25300, likes: latest.length * Math.min(count, 1000) } };
}

function request(port, path, user, address) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = http.get({ host: '127.0.0.1', port, path: `/api/community${path}`, localAddress: address,
      headers: { 'X-Performance-User': user.githubId }, timeout: 30000 }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', data => { body += data; });
      res.on('end', () => {
        try { resolve({ ms: performance.now() - started, status: res.statusCode, body: JSON.parse(body) }); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}
function percentile(values, p) { const sorted = [...values].sort((a,b) => a-b); return +(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] || 0).toFixed(2); }
async function scenario(port, fixture, concurrency, index, mongoMetrics) {
  const kinds = ['career', 'feed', 'profile', 'general-chat', 'season-ranking', 'group-chat'];
  const paths = user => ['/career-leaderboard', '/feed', `/profiles/${user.githubId}`, '/chat', '/leaderboard', `/chat?channel=group:${fixture.group._id}`];
  const samples = Object.fromEntries(kinds.map(k => [k, []])); const statuses = {};
  const cpu = process.cpuUsage(); const start = performance.now();
  let peakRSS = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRSS = Math.max(peakRSS, process.memoryUsage().rss); }, 20);
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  const before = { ...mongoMetrics };
  try {
    await Promise.all(Array.from({ length: concurrency }, async (_, vu) => {
      const user = fixture.users[vu];
      // Linux loopback aliases simulate separate clients; real IP limits remain active.
      const address = `127.5.${index}.${vu + 2}`;
      for (let iteration = 0; iteration < 12; iteration++) {
        const kind = iteration % kinds.length;
        const result = await request(port, paths(user)[kind], user, address);
        statuses[result.status] = (statuses[result.status] || 0) + 1;
        samples[kinds[kind]].push(result.ms);
        assert.equal(result.status, 200, `${kinds[kind]} must succeed, not a throttled/failed response`);
        assert.equal(JSON.stringify(result.body).includes('synthetic-private-token'), false);
        if (kind === 0 || kind === 4) assert.ok(result.body.users.length >= 10);
        if (kind === 1) { assert.equal(result.body.posts.length, 20); assert.equal(result.body.posts[0].likes, Math.min(fixture.users.length, 1000)); }
        if (kind === 2) assert.equal(result.body.career.xp, user.githubStats.xp * 12);
        if (kind === 3 || kind === 5) assert.equal(result.body.messages.length, 30);
      }
    }));
  } finally { clearInterval(sampler); delay.disable(); }
  const elapsed = performance.now() - start; const used = process.cpuUsage(cpu);
  return { concurrency, requests: concurrency * 12, elapsedMs: +elapsed.toFixed(2), requestsPerSecond: +(concurrency * 12000 / elapsed).toFixed(2), statuses,
    nodeCpuMs: +(used.user / 1000 + used.system / 1000).toFixed(2), peakNodeRSSMiB: +(peakRSS / 1048576).toFixed(2), eventLoopP95Ms: +(delay.percentile(95) / 1e6).toFixed(2),
    mongoCommands: mongoMetrics.commands - before.commands, mongoReplyMiB: +((mongoMetrics.bytes - before.bytes) / 1048576).toFixed(3),
    endpoints: Object.fromEntries(Object.entries(samples).map(([k, values]) => [k, { n: values.length, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), maxMs: percentile(values, 1) }])) };
}

function loadBaseline(ref) {
  // Optional read-only comparison: load the historical services under comparison from git
  // into this isolated benchmark process. Production never imports this harness.
  const Module = require('node:module');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  for (const name of ['services/github/league.js', 'services/community/social.js', 'services/community/career-ranking.js']) {
    const filename = path.join(__dirname, '..', name);
    const source = execFileSync('git', ['show', `${ref}:server/${name}`], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const legacy = new Module(filename, module);
    legacy.filename = filename; legacy.paths = Module._nodeModulePaths(path.dirname(filename));
    require.cache[filename] = legacy;
    legacy._compile(source, filename); legacy.loaded = true;
  }
}

async function main() {
  const opts = options();
  const client = new MongoClient(opts.uri, { maxPoolSize: 10, minPoolSize: 0, monitorCommands: true });
  await client.connect();
  const db = client.db(`progresshub_perf_${randomUUID().replaceAll('-', '')}`);
  let server;
  try {
    const fixture = await seed(db, opts.users);
    // Inject the isolated DB only in this harness process, before loading actual routes.
    const dbPath = require.resolve('../db');
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { connectToDatabase: async () => db } };
    if (opts.baselineRef) loadBaseline(opts.baselineRef);
    const viewers = new Map(fixture.users.map(u => [u.githubId, u]));
    const app = express(); app.disable('x-powered-by');
    app.use((req, res, next) => { req.user = viewers.get(req.get('X-Performance-User')); req.isAuthenticated = () => Boolean(req.user); next(); });
    app.use('/api/community', require('../routes/community/community.routes'));
    server = await new Promise(resolve => { const active = app.listen(0, '127.0.0.1', () => resolve(active)); });
    const port = server.address().port;
    // Warm all six paths before collecting, using separate client addresses.
    await scenario(port, fixture, 1, 1, { commands: 0, bytes: 0 });
    const metrics = { commands: 0, bytes: 0 };
    client.on('commandSucceeded', event => { metrics.commands++; metrics.bytes += BSON.calculateObjectSize(event.reply); });
    const scenarios = [];
    for (const [i, concurrency] of [1, 10, 25].entries()) scenarios.push(await scenario(port, fixture, concurrency, i + 2, metrics));
    let limited = 0;
    for (let i = 0; i < 125; i++) { const r = await request(port, '/cosmetics', fixture.users[0], '127.6.0.2'); if (r.status === 429) limited++; else assert.equal(r.status, 200); }
    assert.equal(limited, 5, 'Real read limiter must remain active');
    const report = { label: opts.label, baselineRef: opts.baselineRef || null, generatedAt: new Date().toISOString(), node: process.version, mongo: (await db.admin().serverInfo()).version,
      cpuModel: os.cpus()[0].model, logicalCPUs: os.cpus().length, totalMemoryGiB: +(os.totalmem() / 2 ** 30).toFixed(2), poolSize: 10,
      dataset: fixture.dimensions, scenarios, rateLimitCheck: { requests: 125, expected429: 5, actual429: limited },
      limitations: 'Synthetic loopback API reads; controlled viewer identity replaces OAuth/session deserialization only in this harness. Real routes, rate limits and MongoDB queries are used. No GitHub calls, browser rendering, network latency, uploads or writes are measured. Closed-loop clients have no think time. BSON reply accounting adds instrumentation overhead. Node RSS/CPU exclude MongoDB, browser and OS costs. Not a production capacity guarantee.' };
    const file = `performance-${opts.label}.json`;
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(`PERFORMANCE_REPORT ${JSON.stringify(report)}`);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    // Only the randomly named synthetic database created above is removed.
    await db.dropDatabase(); await client.close();
  }
}
if (require.main === module) main().catch(error => { console.error('Performance benchmark failed:', error.message); process.exitCode = 1; });
module.exports = { options, percentile };
