const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createConnectionManager } = require('../../db/connection');
const { sessionSecret, apiError } = require('../../middleware/runtime-safety');
test('concurrent database requests reuse one pool without request-time pings', async () => {
  let opens = 0, closes = 0;
  const db = {};
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const manager = createConnectionManager(async () => {
    opens++; await ready;
    return { db(name) { assert.equal(name, 'usersDB'); return db; }, async close() { closes++; } };
  });
  const requests = Array.from({ length: 50 }, () => manager.connect('test'));
  assert.equal(opens, 1); release();
  assert.ok((await Promise.all(requests)).every(value => value === db));
  assert.equal(await manager.connect('test'), db); assert.equal(opens, 1);
  await manager.close(); assert.equal(closes, 1);
  await assert.rejects(manager.connect('test'), /closing/);
});
test('failed connection attempts can retry and shutdown waits for an opening pool', async () => {
  let attempts = 0, closed = 0;
  const manager = createConnectionManager(async () => {
    if (++attempts === 1) throw new Error('offline');
    return { db: () => ({}), close: async () => { closed++; } };
  });
  await assert.rejects(manager.connect('test'), /offline/);
  const connecting = manager.connect('test'); const closing = manager.close();
  await connecting; await closing;
  assert.equal(attempts, 2); assert.equal(closed, 1);
});
test('server refuses missing or weak session configuration', () => {
  for (const value of [undefined, '', 'fallback_secret', 'development_session_secret_123']) {
    assert.throws(() => sessionSecret({ SESSION_SECRET: value }), /SESSION_SECRET/);
  }
  assert.equal(sessionSecret({ SESSION_SECRET: 'a'.repeat(48) }), 'a'.repeat(48));
});
test('HTTP parser errors return JSON and do not leak the request or stack', async () => {
  const app = express(); app.use(express.json({ limit: '100b' }));
  app.post('/test', (req, res) => res.json({ ok: true })); app.use(apiError);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/test`;
    for (const [body, status] of [['{"secret":', 400], [JSON.stringify({ secret: 'x'.repeat(200) }), 413]]) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, status); const data = await response.json();
      assert.equal(typeof data.error, 'string'); assert.equal(JSON.stringify(data).includes('secret'), false);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('HTTP active API excludes unauthenticated legacy sharing and paid AI calls', async () => {
  const app = express(); app.use((req, res, next) => { req.isAuthenticated = () => false; next(); });
  app.use('/api', require('../../routes/active'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    for (const [path, method] of [['/collaboration/projects/abc/share','POST'], ['/collaboration/projects/abc/update','PUT'], ['/ai/health','GET'], ['/users/abc','PUT'], ['/auth/todoist','GET']]) {
      assert.ok([404,410].includes((await fetch(base + path, { method })).status));
    }
    assert.equal((await fetch(base + '/auth/google')).status, 410);
    assert.equal((await fetch(base + '/auth/current_user')).status, 401);
    assert.equal((await fetch(base + '/community/chat')).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
