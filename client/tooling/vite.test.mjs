import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

test('Vite serves SPA routes, existing JSX components and only approved public configuration', async () => {
  const previousAPI = process.env.REACT_APP_PROD;
  const previousSecret = process.env.GITHUB_CLIENT_SECRET;
  process.env.REACT_APP_PROD = 'https://api.example.test/api';
  process.env.GITHUB_CLIENT_SECRET = 'private-value-must-not-appear';
  let server;
  try {
    // Check HTTP transforms without an unrelated background cold-cache scan.
    server = await createServer({
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      optimizeDeps: { noDiscovery: true, include: [] }
    });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const path of ['/', '/community', '/community?error=oauth']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes('id="root"'));
      assert.ok(html.includes('/src/index.js'));
      assert.equal(html.includes('%PUBLIC_URL%'), false);
    }
    for (const path of ['/src/index.js', '/src/App.js', '/src/components/Community/Community.js', '/src/components/Community/community.css', '/progress-hub.svg', '/manifest.json']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal((await response.text()).includes('private-value-must-not-appear'), false, path);
    }
    const transformed = await server.transformRequest('/src/components/Community/useCommunityData.js');
    assert.ok(transformed.code.includes('https://api.example.test/api'));
    assert.equal(transformed.code.includes('process.env.REACT_APP_PROD'), false);
    assert.deepEqual(Object.keys(server.config.define).sort(), ['process.env.REACT_APP_GOOGLE_CLIENT_ID', 'process.env.REACT_APP_PROD']);
  } finally {
    if (server) await server.close();
    if (previousAPI === undefined) delete process.env.REACT_APP_PROD; else process.env.REACT_APP_PROD = previousAPI;
    if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET; else process.env.GITHUB_CLIENT_SECRET = previousSecret;
  }
});

test('production HTML references generated assets and retains the existing build directory', async () => {
  const html = await readFile(new URL('../build/index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('/src/index.js'), false);
  assert.equal(html.includes('%PUBLIC_URL%'), false);
  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match => match[1]);
  assert.ok(files.some(file => file.endsWith('.js')));
  assert.ok(files.some(file => file.endsWith('.css')));
  for (const file of files) assert.ok((await readFile(new URL(`../build${file}`, import.meta.url))).length > 0);
});
