// Launch with a fixed timezone before jsdom/Jest load their Date implementation.
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, TZ: 'UTC' }
});
if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
