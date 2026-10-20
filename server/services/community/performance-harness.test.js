const test = require('node:test');
const assert = require('node:assert/strict');
const { options, percentile } = require('../../performance/run');
test('performance harness refuses production/external targets and caller-selected databases', () => {
  for (const uri of [undefined, 'mongodb://remote:27017', 'mongodb://127.0.0.1/usersDB', 'mongodb+srv://remote/', 'mongodb://u:p@localhost/', 'mongodb://localhost/?replicaSet=test']) assert.throws(() => options({ MONGODB_PERF_URI: uri }));
  assert.equal(options({ MONGODB_PERF_URI: 'mongodb://127.0.0.1:27017' }).users, 1000);
  assert.throws(() => options({ MONGODB_PERF_URI: 'mongodb://localhost', PERF_USERS: '500000' }));
});
test('latency percentiles report nearest-rank tail rather than averages', () => {
  assert.equal(percentile([20, 1, 3, 10], .5), 3);
  assert.equal(percentile([20, 1, 3, 10], .95), 20);
});
