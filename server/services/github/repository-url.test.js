const test = require('node:test');
const assert = require('node:assert/strict');
const { repositoryURL } = require('./repository-url');
const { profileSettings } = require('./profile-settings');
test('repository URLs normalize .git and reject nonrepository locations', () => {
  assert.equal(repositoryURL(' github.com/phzl0/QuestLog.git '), 'https://github.com/phzl0/QuestLog');
  assert.equal(repositoryURL('', true), '');
  for (const value of ['https://instagram.com/person', 'https://github.com/user', 'https://github.com/user/repo/tree/main', 'https://github.com/user/repo?tab=readme', 'http://github.com/user/repo', 'https://github.com.evil.com/user/repo', 'https://github.com/topics/javascript', 'https://person:password@github.com/user/repo']) assert.throws(() => repositoryURL(value), { status: 400 });
});
test('filtering legacy external projects keeps the rest of the saved profile', () => {
  const profile = profileSettings({ communityProfile: { bio: 'Minha história', links: [{ label: 'Instagram', url: 'https://instagram.com/example' }], projects: [{ name: 'Old', description: '', icon: 'star', url: 'https://example.com' }] } });
  assert.equal(profile.bio, 'Minha história'); assert.equal(profile.links.length, 1); assert.deepEqual(profile.projects, []);
});
