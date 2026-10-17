const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, profileSettings } = require('./profile-settings');
test('profile keeps only custom fields, trims text and supports two links', () => {
  assert.deepEqual(validateProfile({ bio: ' Dev ', links: [{ label: ' Site ', url: 'https://example.com' }], xp: 9999 }), { bio: 'Dev', links: [{ label: 'Site', url: 'https://example.com/' }], banner: '' });
  assert.deepEqual(profileSettings({}), { bio: '', links: [], banner: '' });
});
test('profile rejects oversized text, too many links and unsafe link protocols', () => {
  for (const input of [{ bio: 'x'.repeat(301) }, { links: [{}, {}, {}] }, ...['javascript:alert(1)', 'data:text/html,hello', 'https://name:password@example.com'].map(url => ({ links: [{ label: 'Site', url }] }))]) {
    assert.throws(() => validateProfile(input), { status: 400 });
  }
});
test('banner accepts bounded WebP bytes and rejects SVG, remote URLs and oversized images', () => {
  const bytes = Buffer.alloc(24); bytes.write('RIFF'); bytes.write('WEBP', 8);
  const banner = `data:image/webp;base64,${bytes.toString('base64')}`;
  assert.equal(validateProfile({ banner }).banner, banner);
  for (const bad of ['https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/webp;base64,' + 'A'.repeat(420000)]) assert.throws(() => validateProfile({ banner: bad }), { status: 400 });
});
