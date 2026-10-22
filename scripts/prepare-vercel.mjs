import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function configuration(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Use a origem HTTPS pública da API, sem caminho ou credenciais.');
  return {
    framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'build',
    git: { deploymentEnabled: false },
    rewrites: [
      { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
      { source: '/((?!api(?:/|$)).*)', destination: '/index.html' }
    ],
    headers: [
      { source: '/api/:path*', headers: [ { key: 'Cache-Control', value: 'private, no-store' }, { key: 'x-vercel-enable-rewrite-caching', value: '0' } ] },
      { source: '/(.*)', headers: [ { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' } ] }
    ]
  };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { writeFileSync(new URL('../client/vercel.json', import.meta.url), JSON.stringify(configuration(process.argv[2]), null, 2)+'\n'); console.log('client/vercel.json preparado. Nenhum deploy executado.'); }
  catch (_) { console.error('Uso: node scripts/prepare-vercel.mjs https://ORIGEM-PUBLICA-DA-API'); process.exitCode=1; }
}
