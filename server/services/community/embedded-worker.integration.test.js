const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const net = require('node:net');
const cwd = path.resolve(__dirname, '../..');

test('importing the worker never starts a background process', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./community-worker');"], { cwd, timeout: 5000, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('background sync enabled'), false);
});

test('embedded worker resumes persisted work after restart and shuts down with the API', { skip: !process.env.MONGODB_TEST_URI, timeout: 30000 }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const name = 'embedded_test_' + randomUUID().replaceAll('-', '');
  const db = client.db(name);
  const reserve = net.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  let child;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code] = await exited;
    child = null;
    assert.equal(code, 0, 'shared API/worker shutdown completes cleanly');
  }
  try {
    await db.collection('users').insertOne({ githubId: '321', name: 'Demo preserved', xp: 123, demoTag: 'fixture' });
    await db.collection('communityJobs').insertOne({ _id: 'github-sync', leaseUntil: new Date(0), startedAt: new Date(0), status: 'running', owner: 'old-process' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const previous = await db.collection('communityJobs').findOne({ _id: 'github-sync' });
      child = spawn(process.execPath, ['server.js'], { cwd, env: {
        ...process.env, NODE_ENV: 'production', COMMUNITY_WORKER_MODE: 'embedded',
        PORT: String(port), CLIENT: 'https://public.example.test',
        GITHUB_CALLBACK_URL: 'https://public.example.test/api/community/auth/callback',
        SESSION_SECRET: 'embedded-test-secret-'.repeat(3), MONGODB_URI: process.env.MONGODB_TEST_URI,
        MONGODB_DB: name, GITHUB_TOKEN_KEY: 'a'.repeat(64), GITHUB_CLIENT_ID: 'fixture-client',
        GITHUB_CLIENT_SECRET: 'fixture-secret', COMMUNITY_ADMIN_GITHUB_IDS: '321', TRUST_PROXY: '1'
      }, stdio: 'ignore' });
      let completed;
      for (let n = 0; n < 100; n++) {
        const job = await db.collection('communityJobs').findOne({ _id: 'github-sync' });
        if (job.status === 'ok' && job.startedAt > previous.startedAt && job.leaseUntil.getTime() === 0) { completed = job; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(completed, 'restart runs a recovery cycle against the persistent database');
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
      await stop();
      assert.equal((await db.collection('users').findOne({ githubId: '321' })).xp, 123);
      assert.equal(await db.collection('users').countDocuments({ demoTag: 'fixture' }), 1);
    }
  } finally {
    try { await stop(); } finally { await db.dropDatabase(); await client.close(); }
  }
});
