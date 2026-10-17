const { windowFor } = require('../missions/rules');
const { appearanceFor } = require('./cosmetics');
function contributionPipeline(now) {
  const week = windowFor('weekly', now);
  return [
    { $match: { kind: 'commit', at: { $gte: week.start.toISOString(), $lte: now.toISOString() } } },
    // One event per SHA and author, including data imported before unique keys existed.
    { $group: { _id: { githubId: '$githubId', id: '$id' }, at: { $min: '$at' } } },
    { $group: { _id: '$_id.githubId', contributions: { $sum: 1 }, reachedAt: { $max: '$at' } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: 'githubId', pipeline: [
      { $match: { communityOptIn: true } },
      { $project: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityAppearance: 1 } }
    ], as: 'user' } },
    { $unwind: '$user' },
    { $project: { _id: 0, githubId: '$_id', githubLogin: '$user.githubLogin', picture: '$user.picture',
      communityAppearance: '$user.communityAppearance', contributions: 1, reachedAt: 1 } },
    { $setWindowFields: { sortBy: { contributions: -1, reachedAt: 1, githubId: 1 }, output: { position: { $sum: 1, window: { documents: ['unbounded', 'current'] } } } } }
    ,{ $sort: { position: 1 } }
  ];
}
async function contributionRanking(db, user = null, now = new Date()) {
  const week = windowFor('weekly', now);
  const result = await db.collection('missionEvents').aggregate([...contributionPipeline(now), { $facet: {
    users: [{ $limit: 100 }],
    me: [{ $match: { githubId: user?.githubId || '' } }, { $limit: 1 }],
    totals: [{ $group: { _id: null, contributions: { $sum: '$contributions' }, participants: { $sum: 1 } } }]
  } }]).toArray();
  const data = result[0] || {};
  const publicRow = row => ({ githubId: row.githubId, githubLogin: row.githubLogin, picture: row.picture,
    appearance: appearanceFor(row), contributions: row.contributions, reachedAt: row.reachedAt, position: row.position });
  const total = data.totals?.[0];
  return { periodKey: week.key, endsAt: week.end, unit: 'commits elegíveis', total: total?.contributions || 0,
    participants: total?.participants || 0, users: (data.users || []).map(publicRow),
    me: data.me?.[0] ? publicRow(data.me[0]) : null };
}
module.exports = { contributionPipeline, contributionRanking };
