const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { feedAction } = require('./social');
const { addComment } = require('./comments');
const { sendMessage } = require('./chat');
const { react } = require('./reactions');
const { claimMission, readMissions } = require('../missions/store');
const { syncSeason, careerFor } = require('../github/league');
const { periodFor, scoreContributions } = require('../github/scoring');
const enabled = Boolean(process.env.MONGODB_TEST_URI);

async function fixture(count = 40) {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI, { maxPoolSize: 10 });
  const db = client.db(`progresshub_writes_${new ObjectId()}`);
  const users = Array.from({ length: count }, (_, i) => ({ _id: new ObjectId(), githubId: String(i + 1), githubLogin: `fixture-${i + 1}`, communityOptIn: true, xp: 77, githubStats: { period: periodFor(), xp: 123 } }));
  await db.collection('users').insertMany(users);
  await db.collection('communityPosts').createIndex({ requestKey: 1 }, { unique: true });
  await db.collection('communityMessages').createIndex({ requestKey: 1 }, { unique: true });
  await db.collection('communitySeasons').createIndex({ githubId: 1, period: 1 }, { unique: true });
  return { db, users, close: async () => { await db.dropDatabase(); await client.close(); } };
}
function statuses(results, allowed = []) {
  for (const result of results) if (result.status === 'rejected') assert.ok(allowed.includes(result.reason.status), `Unexpected failure: ${result.reason.message} (${result.reason.status || result.reason.code})`);
  return results.filter(r => r.status === 'fulfilled').length;
}
async function unchangedXP(db, users) {
  for (const original of users) {
    const saved = await db.collection('users').findOne({ _id: original._id });
    assert.equal(saved.xp, 77); assert.deepEqual(saved.githubStats, original.githubStats);
  }
  for (const name of ['communitySeasons', 'missionRewards', 'achievementRewards']) assert.equal(await db.collection(name).countDocuments({}), 0);
}

test('MongoDB write burst: 40 publishers, duplicate retries, 120 replies and 800 concurrent reaction writes', { skip: !enabled, timeout: 120000 }, async t => {
  const f = await fixture(); const { db, users } = f;
  try {
    const attempts = await Promise.allSettled(users.flatMap(user => Array.from({ length: 3 }, () => feedAction(db, user, { action: 'publish', text: 'Synthetic publication', requestId: `publish-request-${user.githubId.padStart(8, '0')}` }))));
    statuses(attempts, [429]);
    // Requests rejected while a matching publication is in flight may retry with
    // the same key after that write settles. Different new posts stay throttled.
    await Promise.all(users.map(user => feedAction(db, user, { action: 'publish', text: 'Synthetic publication', requestId: `publish-request-${user.githubId.padStart(8, '0')}` })));
    assert.equal(await db.collection('communityPosts').countDocuments({}), 40);
    const post = await db.collection('communityPosts').findOne({ githubId: users[0].githubId });
    const postId = String(post._id);
    const comments = await Promise.all(users.flatMap(user => [0, 1, 2].flatMap(i => [0, 1].map(() => addComment(db, user, 'post', postId, { text: 'Synthetic comment', requestId: `comment-request-${user.githubId}-${i}` })))));
    assert.equal(new Set(comments.map(c => c.id)).size, 120);
    assert.equal(await db.collection('communityComments').countDocuments({}), 120);
    const root = comments[0].id;
    const replies = await Promise.all(users.flatMap(user => [0, 1, 2].flatMap(i => [0, 1].map(() => addComment(db, user, 'post', postId, { text: 'Synthetic reply', replyTo: root, requestId: `reply-request-${user.githubId}-${i}` })))));
    assert.equal(new Set(replies.map(c => c.id)).size, 120);
    assert.equal(await db.collection('communityComments').countDocuments({ rootId: root }), 120);
    assert.equal((await db.collection('communityComments').findOne({ _id: root })).hasReplies, true);
    assert.equal(await db.collection('communityNotifications').countDocuments({_id:/^reply:/}),117);
    assert.equal(await db.collection('communityNotifications').countDocuments({_id:/^comment:/}),117); // each action notifies once; owners do not notify themselves
    const writes = await Promise.allSettled(users.flatMap(user => Array.from({ length: 10 }, () => feedAction(db, user, { action: 'like', postId, liked: true, reaction: 'heart' }))).concat(users.flatMap(user => Array.from({ length: 10 }, () => react(db, user, { kind: 'comment', targetId: root, reaction: 'laugh' })))));
    assert.equal(statuses(writes), 800);
    assert.equal(await db.collection('communityLikes').countDocuments({ postId }), 40);
    assert.equal(await db.collection('communityReactions').countDocuments({ targetId: root }), 40);
    await Promise.all(users.map(user => feedAction(db, user, { action: 'like', postId, liked: false })));
    await Promise.all(users.map(user => react(db, user, { kind: 'comment', targetId: root, reaction: null })));
    assert.equal(await db.collection('communityLikes').countDocuments({}), 0);
    assert.equal(await db.collection('communityReactions').countDocuments({}), 0);
    await unchangedXP(db, users);
    t.diagnostic('40 posts, 120 comments, 120 replies, 117 notifications; 800 reaction attempts; no duplicated records or social XP.');
  } finally { await f.close(); }
});

test('MongoDB write burst: 150 group messages survive duplicate sends, general chat still enforces cooldown', { skip: !enabled, timeout: 120000 }, async t => {
  const f = await fixture(); const { db, users } = f;
  try {
    const group = new ObjectId();
    await db.collection('communityGroups').insertOne({ _id: group, owner: users[0].githubId, members: users.map(u => u.githubId), invited: [], name: 'Synthetic group' });
    const messages = await Promise.all(users.slice(0, 25).flatMap(user => Array.from({ length: 6 }, (_, i) => [0, 1].map(() => sendMessage(db, user, { channel: `group:${group}`, text: 'Synthetic group message', requestId: `group-message-${user.githubId}-${i}` })))).flat());
    assert.equal(messages.length, 300);
    assert.equal(new Set(messages.map(m => m.id)).size, 150);
    assert.equal(await db.collection('communityMessages').countDocuments({ channel: `group:${group}` }), 150);
    const now = new Date();
    const burst = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => sendMessage(db, users[0], { text: 'Synthetic general message', requestId: `general-message-${String(i).padStart(4, '0')}` }, now)));
    assert.equal(statuses(burst, [429]), 1);
    assert.equal(await db.collection('communityMessages').countDocuments({ channel: 'general' }), 1);
    const saved = await db.collection('communityMessages').findOne({ channel: 'general' });
    const originalKey = saved.requestKey.split(':').at(-1);
    const retries = await Promise.all(Array.from({ length: 20 }, () => sendMessage(db, users[0], { text: 'Synthetic general message', requestId: originalKey }, now)));
    assert.ok(retries.every(row => row.id === String(saved._id)));
    assert.equal(await db.collection('communityMessages').countDocuments({ channel: 'general' }), 1);
    const multiuser = await Promise.all(users.slice(1).map(user => sendMessage(db, user, { text: 'Another participant', requestId: `participant-message-${user.githubId}` }, now)));
    assert.equal(multiuser.length, 39);
    assert.equal(await db.collection('communityMessages').countDocuments({ channel: 'general' }), 40);
    await unchangedXP(db, users);
    t.diagnostic('300 parallel group attempts -> 150 messages; one accepted general-chat burst, 19 expected cooldown rejections; 20 retries preserved the same ID.');
  } finally { await f.close(); }
});

async function readyMission(db, user, now) {
  const stats = { ...scoreContributions([5], 0), period: periodFor(now), syncedAt: new Date(now.getTime() - 60000) };
  user.githubStats = stats; user.missionsStartedAt = new Date(now.getTime() - 1000);
  await db.collection('users').updateOne({ _id: user._id }, { $set: { githubStats: stats, missionsStartedAt: user.missionsStartedAt } });
  await db.collection('communitySeasons').insertOne({ githubId: user.githubId, period: periodFor(now), status: 'open', stats });
  await db.collection('missionEvents').insertOne({ _id: 'synthetic-commit', githubId: user.githubId, kind: 'commit', id: 'synthetic-sha', repo: 'fixture/project', at: now.toISOString() });
  return (await readMissions(db, user, now)).missions.find(m => m.id === 'daily-1');
}
async function assertLedger(db, user, base) {
  const rewards = await db.collection('missionRewards').find({ githubId: user.githubId }).toArray();
  assert.equal(rewards.length, 1); assert.equal(rewards[0].xp, 300);
  const achievements = await db.collection('achievementRewards').find({ githubId: user.githubId }).toArray();
  assert.equal(new Set(achievements.map(a => a.achievementId)).size, achievements.length);
  assert.ok(achievements.every(a => a.status === 'paid'));
  const season = await db.collection('communitySeasons').findOne({ githubId: user.githubId });
  assert.equal(season.stats.baseXP, base); assert.equal(season.stats.missionXP, 300);
  assert.equal(season.stats.achievementXP, achievements.reduce((sum, a) => sum + a.xp, 0));
  assert.equal(season.stats.xp, base + 300 + season.stats.achievementXP);
  assert.equal((await careerFor(db, user, false)).xp, season.stats.xp);
  const saved = await db.collection('users').findOne({ _id: user._id });
  assert.equal(saved.githubStats.xp, season.stats.xp); assert.equal(saved.career.xp, season.stats.xp);
  assert.equal(saved.syncLockId, undefined);
  return season.stats.xp;
}

test('MongoDB write burst: mission claims compete with synchronization and credit a single bonus', { skip: !enabled, timeout: 120000 }, async t => {
  const f = await fixture(1); const { db, users: [user] } = f; const now = new Date();
  let release, sync;
  try {
    const mission = await readyMission(db, user, now);
    assert.equal(mission.progress, 100);
    let started; const entered = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    sync = syncSeason(db, user, periodFor(now), { force: true, missions: false, collect: async () => { started(); await gate; return { ...scoreContributions([7], 0), period: periodFor(now), syncedAt: now }; } });
    await entered;
    const busy = await Promise.allSettled(Array.from({ length: 20 }, () => claimMission(db, user, mission.id, mission.periodKey, now)));
    assert.equal(statuses(busy, [409]), 0);
    assert.equal(await db.collection('missionRewards').countDocuments({}), 0);
    release(); await sync;
    const claims = await Promise.allSettled(Array.from({ length: 20 }, () => claimMission(db, user, mission.id, mission.periodKey, now)));
    assert.ok(statuses(claims, [409]) >= 1);
    await claimMission(db, user, mission.id, mission.periodKey, now); // retry a busy request
    const first = await assertLedger(db, user, 70);
    await claimMission(db, user, mission.id, mission.periodKey, now);
    assert.equal(await assertLedger(db, user, 70), first);
    await syncSeason(db, user, periodFor(now), { force: true, missions: false, collect: async () => ({ ...scoreContributions([8], 0), period: periodFor(now), syncedAt: now }) });
    assert.equal(await assertLedger(db, user, 80), first + 10);
    t.diagnostic('20 claims blocked during sync; 20 competing receipts + retries yielded exactly one 300-XP receipt; base XP changed only with the new snapshot.');
  } finally { if (release) release(); if (sync) await sync.catch(() => {}); await f.close(); }
});

test('MongoDB interrupted write: persisted receipt repairs its XP after a failed bonus update', { skip: !enabled, timeout: 120000 }, async t => {
  const f = await fixture(1); const { db, users: [user] } = f; const now = new Date();
  try {
    const mission = await readyMission(db, user, now);
    let fail = true;
    const interrupted = new Proxy(db, { get(target, name) {
      if (name === 'collection') return collectionName => {
        const collection = target.collection(collectionName);
        return new Proxy(collection, { get(col, key) {
          if (key === 'updateOne' && collectionName === 'communitySeasons') return async (...args) => {
            if (fail && args[1]?.$set?.stats) { fail = false; throw new Error('Synthetic interrupted update'); }
            return col.updateOne(...args);
          };
          const value = Reflect.get(col, key, col); return typeof value === 'function' ? value.bind(col) : value;
        } });
      };
      const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(claimMission(interrupted, user, mission.id, mission.periodKey, now), /Synthetic interrupted update/);
    assert.equal(await db.collection('missionRewards').countDocuments({}), 1);
    assert.equal((await db.collection('users').findOne({ _id: user._id })).syncLockId, undefined);
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => claimMission(db, user, mission.id, mission.periodKey, now)));
    assert.ok(statuses(attempts, [409]) >= 1);
    await claimMission(db, user, mission.id, mission.periodKey, now);
    await assertLedger(db, user, 50);
    t.diagnostic('A receipt saved before interruption was credited on retry, without a second receipt or duplicate achievement.');
  } finally { await f.close(); }
});
