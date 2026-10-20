const { progression } = require('../github/scoring');
const { appearanceFor } = require('./cosmetics');
async function careerRanking(db) {
  // Merge authoritative season totals with public accounts in one aggregation.
  // This avoids a separate correlated season aggregation for every participant.
  // A zero season total is authoritative; only missing seasons use legacy XP.
  const users = await db.collection('users').aggregate([
    { $match: { communityOptIn: true, githubId: { $type: 'string' } } },
    { $project: { _id: 0, githubId: 1,
      person: { githubLogin: '$githubLogin', picture: '$picture', communityAppearance: '$communityAppearance' },
      fallbackXP: { $ifNull: ['$githubStats.xp', 0] } } },
    { $unionWith: { coll: 'communitySeasons', pipeline: [
      { $group: { _id: '$githubId', seasonXP: { $sum: '$stats.xp' } } },
      { $project: { _id: 0, githubId: '$_id', seasonXP: 1 } }
    ] } },
    { $group: { _id: '$githubId', person: { $max: '$person' },
      seasonXP: { $max: '$seasonXP' }, fallbackXP: { $max: '$fallbackXP' } } },
    // Accounts without a consenting public profile never enter the response.
    { $match: { person: { $ne: null } } },
    { $project: { _id: 0, githubId: '$_id', githubLogin: '$person.githubLogin', picture: '$person.picture',
      communityAppearance: '$person.communityAppearance', xp: { $ifNull: ['$seasonXP', '$fallbackXP'] } } },
    { $sort: { xp: -1, githubId: 1 } }, { $limit: 10 }
  ], { allowDiskUse: true }).toArray();
  return { users: users.map(({ communityAppearance, xp, ...user }) => ({ ...user,
    career: { xp, ...progression(xp) }, appearance: appearanceFor({ communityAppearance }) })) };
}
module.exports = { careerRanking };
