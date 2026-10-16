const crypto = require('crypto');
const { periodFor, periodBounds } = require('./scoring');
const { preserveLegacy, summarizeCareer } = require('./career');
const { collectStats } = require('./client');

async function ensureLegacy(db, user) {
  if (!user.githubId || !user.githubStats?.period) return;
  const period = user.githubStats.period;
  const result = await db.collection('communitySeasonResults').findOne({ _id: period });
  const alreadyClosed = ['closing', 'closed'].includes(result?.status);
  try {
    await db.collection('communitySeasons').updateOne({ githubId: user.githubId, period }, {
      $setOnInsert: { githubId: user.githubId, period, stats: user.githubStats,
        protectedXP: user.githubStats.xp || 0, eligible: alreadyClosed ? false : Boolean(user.communityOptIn),
        status: alreadyClosed ? 'closed' : 'open', position: null, completeness: 'partial',
        note: 'Registro anterior à migração; cobertura histórica e participação não foram acompanhadas desde o início.',
        createdAt: new Date(), updatedAt: user.githubStats.syncedAt || new Date() }
    }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
}
async function careerFor(db, user, migrate = true) {
  if (migrate) await ensureLegacy(db, user);
  const records = await db.collection('communitySeasons').find({ githubId: user.githubId }).toArray();
  if (!records.length && user.githubStats) return summarizeCareer([{ period: user.githubStats.period, stats: user.githubStats }]);
  return summarizeCareer(records, user.career?.achievements || []);
}
async function syncSeason(db, user, period = periodFor(), { force = false, collect = collectStats } = {}) {
  const users = db.collection('users');
  const seasons = db.collection('communitySeasons');
  const lockId = crypto.randomUUID();
  const now = new Date();
  const lock = await users.updateOne({ _id: user._id,
    $and: [
      { $or: [{ syncLockUntil: { $exists: false } }, { syncLockUntil: { $lt: now } }] },
      ...(force ? [] : [{ $or: [{ 'githubStats.syncedAt': { $exists: false } },
        { 'githubStats.period': { $ne: period } },
        { 'githubStats.syncedAt': { $lt: new Date(now.getTime() - 30000) } }] }])
    ]
  }, { $set: { syncLockId: lockId, syncLockUntil: new Date(now.getTime() + 120000) } });
  if (!lock.modifiedCount) { const error = new Error('Aguarde 30 segundos ou a sincronização em andamento.'); error.status = 429; throw error; }
  try {
    user = await users.findOne({ _id: user._id });
    await ensureLegacy(db, user);
    const closed = await db.collection('communitySeasonResults').findOne({ _id: period, status: { $in: ['closing', 'closed'] } });
    const existing = await seasons.findOne({ githubId: user.githubId, period });
    if (closed || existing?.status === 'closed') return { skipped: true };
    const raw = await collect(user, period, now);
    const stats = preserveLegacy(raw, existing?.protectedXP || 0);
    const stillOwnsLease = await users.findOne({ _id: user._id, syncLockId: lockId, syncLockUntil: { $gt: new Date() } });
    if (!stillOwnsLease) throw new Error('Synchronization lease expired');
    const update = {
      $set: { stats, eligible: period < periodFor(now) ? Boolean(existing?.eligible) : Boolean(stillOwnsLease.communityOptIn), updatedAt: now,
        ...(period < periodFor(now) ? { reconciledAt: now } : {}) },
      $setOnInsert: { githubId: user.githubId, period, status: 'open', protectedXP: 0,
        createdAt: now, completeness: user.createdAt && new Date(user.createdAt) < periodBounds(period).from ? 'observed' : 'partial',
        note: 'Contribuições reconhecidas pelas APIs; atividades removidas ou não indexadas podem não estar disponíveis.' }
    };
    try {
      await seasons.updateOne({ githubId: user.githubId, period, status: { $ne: 'closed' },
        $or: [{ updatedAt: { $lte: now } }, { updatedAt: { $exists: false } }] }, update, { upsert: true });
    } catch (error) { if (error.code === 11000) return { skipped: true }; throw error; }
    const career = await careerFor(db, user, false);
    await users.updateOne({ _id: user._id, syncLockId: lockId }, {
      $set: { career, ...(period === periodFor() ? { githubStats: stats, githubLogin: stats.login } : {}),
        backgroundSyncError: null }, $unset: { backgroundRetryAt: '' }
    });
    return { stats, career };
  } finally {
    await users.updateOne({ _id: user._id, syncLockId: lockId }, { $unset: { syncLockId: '', syncLockUntil: '' } });
  }
}
async function seasonHistory(db, user) {
  await ensureLegacy(db, user);
  const records = await db.collection('communitySeasons').find({ githubId: user.githubId }).sort({ period: -1 }).limit(120).toArray();
  const results = await db.collection('communitySeasonResults').find({ _id: { $in: records.map((record) => record.period) } }).toArray();
  const meta = new Map(results.map((item) => [item._id, item]));
  return records.map((record) => ({
    period: record.period, xp: record.stats?.xp || 0, commits: record.stats?.commits || 0,
    mergedPRs: record.stats?.mergedPRs || 0, rulesVersion: record.stats?.rulesVersion || 1,
    status: meta.get(record.period)?.status === 'closed' ? 'closed' : record.period === periodFor() ? 'open' : 'pending',
    position: meta.get(record.period)?.status === 'closed' ? record.position || null : null,
    participants: meta.get(record.period)?.participants || null, eligible: record.eligible,
    completeness: record.completeness, note: record.note, syncedAt: record.stats?.syncedAt,
    closedAt: meta.get(record.period)?.closedAt || null
  }));
}
async function finalizeSeason(db, period, now = new Date()) {
  if (now.getTime() < periodBounds(period).end.getTime() + 48 * 3600000) return;
  const results = db.collection('communitySeasonResults');
  const existing = await results.findOne({ _id: period });
  if (existing?.status === 'closed') return;
  await results.updateOne({ _id: period }, { $set: { status: 'closing' }, $setOnInsert: { createdAt: now } }, { upsert: true });
  const records = await db.collection('communitySeasons').find({ period }).sort({ 'stats.xp': -1, githubId: 1 }).toArray();
  const ranked = records.filter((record) => record.eligible);
  const positions = new Map(ranked.map((record, index) => [record.githubId, index + 1]));
  for (const record of records) {
    await db.collection('communitySeasons').updateOne({ _id: record._id }, {
      $set: { status: 'closed', position: positions.get(record.githubId) || null,
        completeness: record.reconciledAt && record.completeness !== 'partial' ? 'reconciled' : 'partial', closedAt: now }
    });
  }
  await results.updateOne({ _id: period }, { $set: { status: 'closed', participants: ranked.length, closedAt: now,
    partial: records.some((record) => !record.reconciledAt || record.completeness === 'partial') } });
}
module.exports = { ensureLegacy, careerFor, syncSeason, seasonHistory, finalizeSeason };
