const { progression } = require('../github/scoring');
const { appearanceFor } = require('./cosmetics');
async function careerRanking(db) {
  const users = await db.collection('users').aggregate([
    { $match: { communityOptIn: true, githubId: { $type: 'string' } } },
    { $lookup: { from: 'communitySeasons', let: { id: '$githubId' }, pipeline: [
      { $match: { $expr: { $eq: ['$githubId', '$$id'] } } },
      { $group: { _id: null, xp: { $sum: '$stats.xp' } } }
    ], as: 'totals' } },
    { $project: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityAppearance: 1,
      xp: { $ifNull: [{ $arrayElemAt: ['$totals.xp', 0] }, { $ifNull: ['$githubStats.xp', 0] }] } } },
    { $sort: { xp: -1, githubId: 1 } }, { $limit: 10 }
  ]).toArray();
  return { users: users.map(({ communityAppearance, xp, ...user }) => ({ ...user,
    career: { xp, ...progression(xp) }, appearance: appearanceFor({ communityAppearance }) })) };
}
module.exports = { careerRanking };
