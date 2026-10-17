const crypto = require('crypto');
const { activeMissions, claimCandidates } = require('./rules');
const { periodFor, scoreContributions, progression } = require('../github/scoring');
const { collectMissionEvents } = require('./github');
async function enroll(db, user, now = new Date()) {
  await db.collection('users').updateOne({ _id: user._id, missionsStartedAt: { $exists: false } }, { $set: { missionsStartedAt: now } });
  return db.collection('users').findOne({ _id: user._id });
}
async function readMissions(db, user, now = new Date()) {
  user = await enroll(db, user, now);
  const events = await db.collection('missionEvents').find({ githubId: user.githubId, at: { $gte: new Date(now.getTime() - 65 * 86400000).toISOString() } }).toArray();
  const active = activeMissions(events, user.missionsStartedAt, now);
  // Keep completed previous-period objectives claimable during the existing 48h grace.
  const keys = new Set(active.map(m => `${m.id}:${m.periodKey}`));
  for (const mission of claimCandidates(events, user.missionsStartedAt, now)) {
    if (!keys.has(`${mission.id}:${mission.periodKey}`)) active.push({ ...mission, previousPeriod: true });
  }
  const rewards = await db.collection('missionRewards').find({ githubId: user.githubId, $or: active.map((mission) => ({ missionId: mission.id, periodKey: mission.periodKey })) }).toArray();
  const recent = await db.collection('missionRewards').find({ githubId: user.githubId }).sort({ awardedAt: -1 }).limit(15).toArray();
  const paid = new Map(rewards.map((reward) => [`${reward.missionId}:${reward.periodKey}`, reward]));
  const missions = active.map((mission) => {
    const reward = paid.get(`${mission.id}:${mission.periodKey}`);
    return { ...mission, awarded: Boolean(reward), awardedAt: reward?.awardedAt || null,
      requirements: reward?.requirements || mission.requirements, progress: reward ? 100 : mission.progress, completedAt: reward?.completedAt || mission.completedAt,
      encouragement: reward ? `Bônus de ${mission.xp.toLocaleString('pt-BR')} XP recebido. Continue construindo!` : mission.encouragement };
  });
  return { missions: missions.filter(mission => !mission.previousPeriod),
    pendingRewards: missions.filter(mission => mission.previousPeriod && !mission.awarded), startedAt: user.missionsStartedAt, syncedAt: user.missionsSyncedAt || null,
    partial: Boolean(user.missionsPartial), error: user.missionsError || null,
    recentRewards: recent.map(({ missionId, kind, number, xp, periodKey, awardedAt, creditedPeriod }) => ({ missionId, kind, number, xp, periodKey, awardedAt, creditedPeriod })) };
}
function addMissionBonus(stats, bonus, communityBonus = stats.communityXP || 0) {
  const baseXP = stats.baseXP ?? stats.xp - (stats.missionXP || 0) - (stats.communityXP || 0);
  const xp = baseXP + bonus + communityBonus;
  return { ...stats, baseXP, missionXP: bonus, communityXP: communityBonus, xp, ...progression(xp), breakdown: { ...stats.breakdown, missionXP: bonus, communityXP: communityBonus } };
}
async function updateBonuses(db, user, now = new Date(), period = periodFor(now)) {
  const rewards = await db.collection('missionRewards').find({ githubId: user.githubId, creditedPeriod: period }).toArray();
  const communityRewards = await db.collection('communityPoolShares').find({ githubId: user.githubId, creditedPeriod: period }).toArray();
  if (!rewards.length && !communityRewards.length) return false;
  const total = rewards.reduce((sum, reward) => sum + reward.xp, 0);
  const seasons = db.collection('communitySeasons');
  const existing = await seasons.findOne({ githubId: user.githubId, period });
  if (existing?.status === 'closed') return false;
  const stats = addMissionBonus(existing?.stats || { ...scoreContributions([], 0), period, syncedAt: now }, total, communityRewards.reduce((sum, reward) => sum + reward.xp, 0));
  stats.communityRewardIds = communityRewards.map(reward => reward._id);
  await seasons.updateOne({ githubId: user.githubId, period, status: { $ne: 'closed' } }, {
    $set: { stats, updatedAt: now },
    $setOnInsert: { githubId: user.githubId, period, status: 'open', eligible: Boolean(user.communityOptIn),
      protectedXP: 0, createdAt: now, completeness: 'partial', note: 'Bônus confirmado; contribuições do período aguardam reconciliação.' }
  }, { upsert: true });
  return true;
}
async function syncMissions(db, user, now = new Date(), collector = collectMissionEvents) {
  user = await enroll(db, user, now);
  const collection = await collector(user, now);
  const events = db.collection('missionEvents');
  for (const event of collection.events) {
    if (new Date(event.at) < new Date(user.missionsStartedAt) || new Date(event.at) > now) continue;
    const key = `${user.githubId}:${event.kind}:${event.id}`;
    if (event.kind === 'release') {
      await events.updateOne({ _id: key }, { $set: { ...event, githubId: user.githubId, checkedAt: now } }, { upsert: true });
    } else {
      const { collaborative, issueClosed, ...stable } = event;
      await events.updateOne({ _id: key }, { $setOnInsert: { ...stable, githubId: user.githubId, confirmedAt: new Date() },
        ...(event.kind === 'merged' ? { $max: { collaborative: Boolean(collaborative), issueClosed: Boolean(issueClosed) } } : {}) }, { upsert: true });
    }
  }
  await events.updateMany({ githubId: user.githubId, confirmedAt: { $exists: false } }, { $set: { confirmedAt: new Date() } });
  await updateBonuses(db, user, now);
  await db.collection('users').updateOne({ _id: user._id }, { $set: { missionsSyncedAt: now, missionsPartial: collection.partial, missionsError: null } });
}
async function claimMission(db, user, missionId, periodKey, now = new Date()) {
  if (typeof missionId !== 'string' || typeof periodKey !== 'string' || missionId.length > 30 || periodKey.length > 40) {
    const error = new Error('Missão inválida.'); error.status = 400; throw error;
  }
  const users = db.collection('users');
  const lockId = crypto.randomUUID();
  const lock = await users.updateOne({ _id: user._id, $or: [
    { syncLockUntil: { $exists: false } }, { syncLockUntil: { $lt: now } }
  ] }, { $set: { syncLockId: lockId, syncLockUntil: new Date(now.getTime() + 300000) } });
  if (!lock.modifiedCount) { const error = new Error('Sincronização em andamento. Tente receber novamente em instantes.'); error.status = 409; throw error; }
  try {
    user = await enroll(db, user, now);
    const { ensureLegacy, careerFor } = require('../github/league');
    await ensureLegacy(db, user);
    const key = `${user.githubId}:${missionId}:${periodKey}:v1`;
    const rewards = db.collection('missionRewards');
    const existing = await rewards.findOne({ _id: key });
    if (!existing) {
      const events = await db.collection('missionEvents').find({ githubId: user.githubId,
        at: { $gte: new Date(now.getTime() - 65 * 86400000).toISOString() } }).toArray();
      const mission = claimCandidates(events, user.missionsStartedAt, now)
        .find(m => m.id === missionId && m.periodKey === periodKey);
      if (!mission) { const error = new Error('Esta missão ainda não foi concluída ou o prazo para receber terminou.'); error.status = 409; throw error; }
      try {
        await rewards.insertOne({ _id: key, githubId: user.githubId, missionId: mission.id,
          kind: mission.kind, number: mission.number, periodKey: mission.periodKey, xp: mission.xp,
          version: 1, completedAt: mission.completedAt, awardedAt: now, creditedPeriod: periodFor(now), requirements: mission.requirements });
      } catch (error) { if (error.code !== 11000) throw error; }
    }
    // Sum the ledger instead of incrementing: retries also repair interrupted claims.
    await updateBonuses(db, user, now);
    const current = await db.collection('communitySeasons').findOne({ githubId: user.githubId, period: periodFor(now) });
    const career = await careerFor(db, user, false);
    await users.updateOne({ _id: user._id, syncLockId: lockId }, { $set: {
      career, ...(current?.stats ? { githubStats: current.stats } : {})
    } });
    return readMissions(db, user, now);
  } finally {
    await users.updateOne({ _id: user._id, syncLockId: lockId }, { $unset: { syncLockId: '', syncLockUntil: '' } });
  }
}
module.exports = { enroll, readMissions, addMissionBonus, syncMissions, updateBonuses, claimMission };
