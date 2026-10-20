const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { readFeed } = require('./social');
const { careerFor } = require('../github/league');
const { summarizeCareer } = require('../github/career');

test('MongoDB: bounded feed reaction buckets preserve counts, current viewer and legacy hearts', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`perf_reactions_${new ObjectId()}`);
  try {
    const a = { githubId: '1', githubLogin: 'alice', communityOptIn: true };
    const b = { githubId: '2', githubLogin: 'bob', communityOptIn: true };
    const post = new ObjectId();
    await db.collection('users').insertMany([a, b]);
    await db.collection('communityPosts').insertOne({ _id: post, githubId: '1', text: 'A publication', createdAt: new Date() });
    await db.collection('communityLikes').insertMany([
      { _id: 'owner', postId: String(post), githubId: '1', reaction: 'sad' },
      { _id: 'legacy', postId: String(post), githubId: '2' },
      ...Array.from({ length: 2000 }, (_, i) => ({ _id: `reaction-${i}`, postId: String(post), githubId: String(10 + i), reaction: ['heart','like','laugh','sad'][i % 4] }))
    ]);
    const first = (await readFeed(db, a)).posts[0];
    assert.equal(first.likes, 2002); assert.equal(first.liked, true); assert.equal(first.reaction, 'sad');
    assert.deepEqual(first.reactions, { heart: 501, like: 500, laugh: 500, sad: 501 });
    const second = (await readFeed(db, b)).posts[0]; assert.equal(second.reaction, 'heart');
    await db.collection('communityLikes').deleteOne({ _id: 'legacy' });
    const next = (await readFeed(db, b)).posts[0]; assert.equal(next.liked, false); assert.equal(next.reaction, null); assert.equal(next.likes, 2001);
    await db.collection('communityPosts').updateOne({ _id: post }, { $set: { moderationHidden: true } });
    assert.equal((await readFeed(db, a)).posts.length, 0);
  } finally { await db.dropDatabase(); await client.close(); }
});

test('MongoDB: lean career query preserves authoritative totals, titles, positions and achievements', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI, { monitorCommands: true });
  const db = client.db(`perf_career_${new ObjectId()}`);
  try {
    const user = { githubId: '1', career: { achievements: ['Prior achievement'] } };
    const seasons = [
      { githubId: '1', period: '2026-09', status: 'closed', position: 3, stats: { xp: 1000, commits: 50, mergedPRs: 10, achievements: ['Season achievement'], pullRequests: [{ title: 'Private detail'.repeat(1000) }] } },
      { githubId: '1', period: '2026-10', status: 'open', stats: { xp: 500, commits: 10, mergedPRs: 2, achievements: ['Another achievement'], commitDays: [{ date: '2026-10-01', xp: 100 }] } }
    ];
    await db.collection('communitySeasons').insertMany(seasons);
    let query;
    client.on('commandStarted', event => { if (event.commandName === 'find' && event.command.find === 'communitySeasons') query = event.command; });
    assert.deepEqual(await careerFor(db, user, false), summarizeCareer(seasons, user.career.achievements));
    assert.equal(query.projection['stats.xp'], 1);
    assert.equal(query.projection['stats.pullRequests'], undefined);
    assert.equal(query.projection['stats.commitDays'], undefined);
    await db.collection('communitySeasons').updateOne({ period: '2026-10' }, { $set: { 'stats.xp': 800 } });
    assert.equal((await careerFor(db, user, false)).xp, 1800);
  } finally { await db.dropDatabase(); await client.close(); }
});
