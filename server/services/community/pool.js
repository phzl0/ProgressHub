const crypto = require('crypto');
const { windowFor } = require('../missions/rules');
const { appearanceFor } = require('./cosmetics');
const { periodFor } = require('../github/scoring');
const POOL_XP = 40000;
const TARGET = 100;
const GRACE = 48 * 3600000;
async function initializePool(db, now = new Date()) {
  const config = db.collection('communityPoolConfig');
  try { await config.updateOne({ _id: 'weekly-v1' }, { $setOnInsert: { activatedAt: now } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const settings = await config.findOne({ _id: 'weekly-v1' });
  if (!settings.initialized) {
    await db.collection('users').updateMany({ githubId: { $type: 'string' }, communityParticipation: { $exists: false } }, [{
      $set: { communityParticipation: { $cond: ['$communityOptIn', [{ from: settings.activatedAt, to: null }], []] } }
    }]);
    await db.collection('users').updateMany({ githubId: { $type: 'string' }, communityOptIn: true, missionsStartedAt: { $exists: false } }, { $set: { missionsStartedAt: settings.activatedAt } });
    await config.updateOne({ _id: 'weekly-v1' }, { $set: { initialized: true } });
  }
  return settings;
}
async function setParticipation(db, user, optedIn, now = new Date()) {
  await initializePool(db, now);
  const history = { $ifNull: ['$communityParticipation', []] };
  const intervals = optedIn ? { $cond: ['$communityOptIn', history, { $concatArrays: [history, [{ from: now, to: null }]] }] }
    : { $map: { input: history, as: 'interval', in: { $cond: [{ $eq: ['$$interval.to', null] }, { from: '$$interval.from', to: now }, '$$interval'] } } };
  await db.collection('users').updateOne({ _id: user._id }, [{ $set: { communityParticipation: intervals, communityOptIn: optedIn, ...(optedIn ? { missionsStartedAt: { $ifNull: ['$missionsStartedAt', now] } } : {}) } }]);
}
async function ensurePool(db, now = new Date()) {
  const config = await initializePool(db, now);
  const week = windowFor('weekly', now);
  const pools = db.collection('communityPools');
  const startsAt = new Date(Math.max(week.start.getTime(), new Date(config.activatedAt).getTime()));
  try { await pools.updateOne({ _id: week.key }, { $setOnInsert: { startsAt, endsAt: week.end,
    closesAt: new Date(week.end.getTime() + GRACE), poolXP: POOL_XP, target: TARGET, status: 'open', createdAt: now } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  return pools.findOne({ _id: week.key });
}
function poolPipeline(pool, now = new Date()) {
  return [
    { $match: { kind: 'commit', at: { $gte: new Date(pool.startsAt).toISOString(), $lt: new Date(pool.endsAt).toISOString(), $lte: now.toISOString() },
      confirmedAt: { $lte: new Date(Math.min(new Date(pool.closesAt).getTime(), now.getTime())) } } },
    { $group: { _id: { githubId: '$githubId', id: '$id' }, at: { $min: '$at' } } },
    { $lookup: { from: 'users', localField: '_id.githubId', foreignField: 'githubId', let: { activityAt: { $toDate: '$at' } }, pipeline: [
      { $match: { $expr: { $anyElementTrue: [{ $map: { input: { $ifNull: ['$communityParticipation', []] }, as: 'interval', in: {
        $and: [{ $lte: ['$$interval.from', '$$activityAt'] }, { $or: [{ $eq: ['$$interval.to', null] }, { $gt: ['$$interval.to', '$$activityAt'] }] }]
      } } }] } } },
      { $project: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityOptIn: 1, communityAppearance: 1 } }
    ], as: 'user' } },
    { $unwind: '$user' },
    { $group: { _id: '$_id.githubId', contributions: { $sum: 1 }, reachedAt: { $max: '$at' }, user: { $first: '$user' } } },
    { $project: { _id: 0, githubId: '$_id', contributions: 1, reachedAt: 1, user: 1 } },
    { $setWindowFields: { sortBy: { contributions: -1, reachedAt: 1, githubId: 1 }, output: { position: { $sum: 1, window: { documents: ['unbounded', 'current'] } } } } },
    { $sort: { position: 1 } }
  ];
}
function shareXP(contributions, total, budget = POOL_XP) {
  return total > 0 ? Math.floor(budget * contributions / total) : 0;
}
async function poolView(db, user = null, now = new Date()) {
  const pool = await ensurePool(db, now);
  const rows = await db.collection('missionEvents').aggregate([...poolPipeline(pool, now), { $facet: {
    users: [{ $limit: 100 }], me: [{ $match: { githubId: user?.githubId || '' } }],
    totals: [{ $group: { _id: null, contributions: { $sum: '$contributions' }, participants: { $sum: 1 } } }]
  } }]).toArray();
  const data = rows[0] || {};
  const total = data.totals?.[0]?.contributions || 0;
  const row = item => {
    const visible = item.user?.communityOptIn || item.githubId === user?.githubId;
    return { participantId: visible ? item.githubId : `private-${item.position}`, githubId: visible ? item.githubId : null,
      githubLogin: visible ? item.user?.githubLogin : null, picture: visible ? item.user?.picture : null,
      appearance: visible ? appearanceFor(item.user) : appearanceFor(), position: item.position,
      contributions: item.contributions, reachedAt: item.reachedAt,
      percentage: total ? item.contributions / total * 100 : 0, estimatedXP: shareXP(item.contributions, total, pool.poolXP) };
  };
  const history = await db.collection('communityPools').find({ status: { $in: ['open', 'paid', 'paying', 'not_met'] }, _id: { $ne: pool._id }, endsAt: { $lte: now } }).sort({ endsAt: -1 }).limit(8).toArray();
  const payments = user ? await db.collection('communityPoolShares').find({ githubId: user.githubId, poolId: { $in: history.map(p => p._id) } }).toArray() : [];
  const historyRows = [];
  for (const previous of history) {
    let total = previous.total || 0;
    let estimate = 0;
    if (previous.status === 'open') {
      const result = await db.collection('missionEvents').aggregate([...poolPipeline(previous, now), { $facet: {
        totals: [{ $group: { _id: null, total: { $sum: '$contributions' } } }],
        me: [{ $match: { githubId: user?.githubId || '' } }]
      } }]).toArray();
      total = result[0]?.totals?.[0]?.total || 0;
      estimate = shareXP(result[0]?.me?.[0]?.contributions || 0, total, previous.poolXP);
    }
    const payment = payments.find(share => share.poolId === previous._id);
    historyRows.push({ periodKey: previous._id, endsAt: previous.endsAt, closesAt: previous.closesAt,
      status: previous.status === 'open' ? 'validating' : previous.status, total, participants: previous.participants,
      distributedXP: previous.distributedXP || 0, unusedXP: previous.unusedXP || 0,
      xp: payment?.xp || estimate, estimated: previous.status === 'open', paid: payment?.status === 'paid', awardedAt: payment?.awardedAt || null });
  }
  return { periodKey: pool._id, startsAt: pool.startsAt, endsAt: pool.endsAt, closesAt: pool.closesAt,
    poolXP: pool.poolXP, target: pool.target, total, participants: data.totals?.[0]?.participants || 0,
    status: now < new Date(pool.endsAt) ? 'open' : 'validating', unit: 'commits elegíveis',
    users: (data.users || []).map(row), me: data.me?.[0] ? row(data.me[0]) : null,
    history: historyRows };

}
async function payShare(db, share, now = new Date()) {
  const users = db.collection('users');
  const owner = crypto.randomUUID();
  const locked = await users.updateOne({ githubId: share.githubId, $or: [{ syncLockUntil: { $exists: false } }, { syncLockUntil: { $lt: now } }] },
    { $set: { syncLockId: owner, syncLockUntil: new Date(now.getTime() + 300000) } });
  if (!locked.modifiedCount) return false;
  try {
    const user = await users.findOne({ githubId: share.githubId });
    const { ensureLegacy, careerFor } = require('../github/league');
    const { updateBonuses } = require('../missions/store');
    await ensureLegacy(db, user);
    share = await db.collection('communityPoolShares').findOne({ _id: share._id });
    if (share.status === 'paid') return true;
    let creditedPeriod = share.creditedPeriod || periodFor(now);
    const previous = await db.collection('communitySeasons').findOne({ githubId: user.githubId, period: creditedPeriod });
    const alreadyIncluded = previous?.stats?.communityRewardIds?.includes(share._id);
    if (!alreadyIncluded && creditedPeriod !== periodFor(now)) creditedPeriod = periodFor(now);
    const awardedAt = share.creditedPeriod && share.creditedPeriod !== creditedPeriod ? now : share.awardedAt || now;
    if (!alreadyIncluded) {
      await db.collection('communityPoolShares').updateOne({ _id: share._id }, { $set: { creditedPeriod, awardedAt } });
      if (share.xp > 0 && !await updateBonuses(db, user, now, creditedPeriod)) throw new Error('Reward season could not be reconciled');
    }
    const current = await db.collection('communitySeasons').findOne({ githubId: user.githubId, period: periodFor(now) });
    const career = await careerFor(db, user, false);
    await users.updateOne({ _id: user._id, syncLockId: owner }, { $set: { career, ...(current?.stats ? { githubStats: current.stats } : {}) } });
    await db.collection('communityPoolShares').updateOne({ _id: share._id }, { $set: { status: 'paid', paidAt: now, creditedPeriod, awardedAt } });
    return true;
  } finally { await users.updateOne({ githubId: share.githubId, syncLockId: owner }, { $unset: { syncLockId: '', syncLockUntil: '' } }); }
}
async function settlePool(db, poolId, now = new Date()) {
  const pools = db.collection('communityPools');
  let pool = await pools.findOne({ _id: poolId });
  if (!pool || ['paid', 'not_met'].includes(pool.status) || now < new Date(pool.closesAt)) return;
  const owner = crypto.randomUUID();
  const acquired = await pools.updateOne({ _id: poolId, status: { $in: ['open', 'paying'] }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }] },
    { $set: { owner, leaseUntil: new Date(now.getTime() + 300000) } });
  if (!acquired.modifiedCount) return;
  try {
    pool = await pools.findOne({ _id: poolId });
    if (pool.status === 'open') {
      const totals = await db.collection('missionEvents').aggregate([...poolPipeline(pool, now), { $group: { _id: null, total: { $sum: '$contributions' }, participants: { $sum: 1 } } }]).toArray();
      const total = totals[0]?.total || 0;
      if (total < pool.target) {
        await pools.updateOne({ _id: poolId, owner }, { $set: { status: 'not_met', total, participants: totals[0]?.participants || 0, distributedXP: 0, unusedXP: pool.poolXP, closedAt: now } });
        return;
      }
      let distributedXP = 0;
      let frozen = 0;
      for await (const row of db.collection('missionEvents').aggregate(poolPipeline(pool, now))) {
        if (++frozen % 100 === 0) {
          const lease = await pools.updateOne({ _id: poolId, owner }, { $set: { leaseUntil: new Date(Math.max(Date.now(), now.getTime()) + 300000) } });
          if (!lease.matchedCount) return;
        }
        const xp = shareXP(row.contributions, total, pool.poolXP); distributedXP += xp;
        await db.collection('communityPoolShares').updateOne({ _id: `${poolId}:${row.githubId}` }, { $setOnInsert: {
          poolId, githubId: row.githubId, contributions: row.contributions, reachedAt: row.reachedAt,
          position: row.position, xp, status: 'pending', createdAt: now
        } }, { upsert: true });
      }
      await pools.updateOne({ _id: poolId, owner }, { $set: { status: 'paying', total, participants: totals[0].participants,
        distributedXP, unusedXP: pool.poolXP - distributedXP, frozenAt: now } });
    }
    for await (const share of db.collection('communityPoolShares').find({ poolId, status: 'pending' })) {
      const lease = await pools.updateOne({ _id: poolId, owner }, { $set: { leaseUntil: new Date(Math.max(Date.now(), now.getTime()) + 300000) } });
      if (!lease.matchedCount) return;
      await payShare(db, share, new Date(Math.max(Date.now(), now.getTime())));
    }
    if (!await db.collection('communityPoolShares').countDocuments({ poolId, status: 'pending' })) {
      await pools.updateOne({ _id: poolId, owner }, { $set: { status: 'paid', closedAt: now } });
    }
  } finally { await pools.updateOne({ _id: poolId, owner }, { $unset: { owner: '', leaseUntil: '' } }); }
}
async function settlePools(db, now = new Date()) {
  await ensurePool(db, now);
  const pending = await db.collection('communityPools').find({ status: { $in: ['open', 'paying'] }, closesAt: { $lte: now } }).toArray();
  for (const pool of pending) await settlePool(db, pool._id, now);
}
module.exports = { POOL_XP, TARGET, GRACE, initializePool, setParticipation, ensurePool, poolPipeline, poolView, shareXP, payShare, settlePool, settlePools };
