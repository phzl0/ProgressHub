const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOG, appearanceFor, validateAppearance } = require('./cosmetics');
test('initial collection has five frames, three themed covers and only allowlisted appearance fields', () => {
  assert.equal(CATALOG.frames.length, 5); assert.equal(CATALOG.covers.filter(c => c.id !== 'custom').length, 3);
  assert.deepEqual(validateAppearance({ frame: 'prestige', cover: 'orbit', title: 'building', xp: 40000 }), { frame: 'prestige', cover: 'orbit', title: 'building' });
  assert.deepEqual(appearanceFor({}), { frame: 'essential', cover: 'custom', title: 'none' });
  assert.throws(() => validateAppearance({ frame: 'url(https://example.com)', cover: 'custom', title: 'none' }), { status: 400 });
});
