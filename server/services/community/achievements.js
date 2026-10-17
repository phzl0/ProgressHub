const { progression, periodFor } = require('../github/scoring');
const tiers = (metric, category, values, names, rewards, unit) => values.map((target, i) => ({
  id: `${metric}-${target}`, name: names[i], category, metric, target, xp: rewards[i],
  description: `Acumule ${target} ${unit}.`, tone: i >= 4 ? 'gold' : i >= 2 ? 'purple' : 'green'
}));
const ACHIEVEMENTS = [
  ...tiers('commits', 'commits', [1, 10, 50, 100, 250, 500, 1000], ['Primeiro commit', 'Código em movimento', 'Construindo o caminho', 'Cem passos à frente', 'Ritmo de construção', 'Meio milhar de passos', 'Mil contribuições'], [300, 300, 500, 1000, 1500, 2000, 5000], 'commits elegíveis na carreira'),
  ...tiers('mergedPRs', 'pulls', [1, 5, 10, 25, 50, 100], ['Primeiro PR mesclado', 'Cinco entregas', 'Dez entregas', 'Entrega constante', 'Cinquenta entregas', 'Cem entregas'], [300, 500, 1000, 1500, 2000, 5000], 'PRs próprios mesclados e pontuados'),
  ...tiers('days', 'consistency', [1, 7, 15, 30, 60, 100], ['Dia de construir', 'Sete dias de código', 'Quinze dias de evolução', 'Trinta dias de jornada', 'Sessenta dias em ação', 'Cem dias construindo'], [300, 500, 1000, 1500, 2000, 3000], 'dias UTC diferentes com commits pontuados; não precisam ser consecutivos'),
  ...tiers('reviews', 'reviews', [1, 5, 15, 30], ['Um olhar que ajuda', 'Cinco olhares', 'Revisor presente', 'Revisor da comunidade'], [300, 500, 1000, 2000], 'PRs distintos de outras pessoas revisados e acompanhados pela plataforma'),
  ...tiers('collaboration', 'collaboration', [1, 5, 15], ['Construindo junto', 'Cinco colaborações', 'Colaboração que cresce'], [500, 1000, 2000], 'PRs próprios mesclados por outra pessoa humana, reconhecidos pela pontuação'),
  ...tiers('missions', 'missions', [1, 10, 30, 100], ['Primeiro bônus de missão', 'Dez objetivos cumpridos', 'Trinta objetivos cumpridos', 'Cem objetivos cumpridos'], [300, 1000, 2000, 5000], 'missões concluídas e recebidas'),
  ...tiers('releases', 'releases', [1, 3], ['Uma versão para o mundo', 'Três versões entregues'], [2000, 5000], 'releases próprias verificadas: 20 commits, 5 PRs incluídos, README e arquivo de implementação'),
  ...tiers('seasons', 'career', [2, 6], ['A jornada continua', 'Seis capítulos'], [1000, 3000], 'meses diferentes com commits ou PRs pontuados'),
  ...tiers('level', 'career', [5, 10, 20], ['Nível 5', 'Nível 10', 'Nível 20'], [500, 1500, 3000], 'níveis de carreira'),
  { id: 'monthly-commits-50', name: '50 commits no mês', category: 'commits', metric: 'monthlyCommits', target: 50, xp: 500, description: 'Faça 50 commits pontuados em um mesmo mês, uma vez na carreira.', tone: 'purple' }
];
// Level milestones describe a threshold, rather than a cumulative number of levels.
for (const item of ACHIEVEMENTS.filter(a => a.metric === 'level')) item.description = `Alcance o nível ${item.target} de carreira.`;
function achievementMetrics(records, events, missions, now = new Date()) {
  const seasons = [...new Map(records.map(r => [r.period, r])).values()];
  const days = new Set(); const reviews = new Set(); const releases = new Set();
  for (const record of seasons) for (const day of record.stats?.commitDays || []) if (day.credited > 0) days.add(day.date);
  for (const event of events) {
    if (new Date(event.at) > now) continue;
    if (event.kind === 'review' && event.prId) reviews.add(event.prId);
    if (event.kind === 'release' && event.id && event.readme && event.implementation &&
      new Set(event.commitIds || []).size >= 20 && new Set(event.prIds || []).size >= 5) releases.add(event.id);
  }
  const sum = key => seasons.reduce((total, record) => total + (record.stats?.[key] || 0), 0);
  return { commits: sum('commits'), mergedPRs: sum('mergedPRs'), days: days.size, reviews: reviews.size, releases: releases.size,
    collaboration: seasons.reduce((total, record) => total + (record.stats?.breakdown?.collaborativePRs || 0), 0),
    missions: new Set(missions.map(m => m._id)).size,
    seasons: seasons.filter(r => r.stats?.commits > 0 || r.stats?.mergedPRs > 0).length,
    monthlyCommits: Math.max(0, ...seasons.map(r => r.stats?.commits || 0)),
    xp: sum('xp'), level: progression(sum('xp')).level };
}
async function achievementState(db, user, now = new Date()) {
  const [records, events, missions, rewards] = await Promise.all([
    db.collection('communitySeasons').find({ githubId: user.githubId }).toArray(),
    db.collection('missionEvents').find({ githubId: user.githubId, kind: { $in: ['review', 'release'] } }).toArray(),
    db.collection('missionRewards').find({ githubId: user.githubId }).toArray(),
    db.collection('achievementRewards').find({ githubId: user.githubId }).toArray()
  ]);
  const metrics = achievementMetrics(records, events, missions, now);
  const legacy = new Set([...(user.career?.achievements || []), ...records.flatMap(r => r.stats?.achievements || [])]);
  return { metrics, rewards, legacy };
}
async function readAchievements(db, user, now = new Date()) {
  const { metrics, rewards, legacy } = await achievementState(db, user, now);
  const paid = new Map(rewards.map(r => [r.achievementId, r]));
  return { achievements: ACHIEVEMENTS.map(item => {
    const reward = paid.get(item.id);
    const current = Math.min(item.target, metrics[item.metric] || 0);
    const unlocked = Boolean(reward) || legacy.has(item.name) || current >= item.target;
    return { ...item, current: unlocked ? item.target : current, progress: unlocked ? 100 : Math.floor(current / item.target * 100),
      unlocked, awarded: reward?.status === 'paid', awardedAt: reward?.status === 'paid' ? reward.awardedAt : null,
      creditedPeriod: reward?.status === 'paid' ? reward.creditedPeriod : null };
  }), bonusXP: rewards.filter(r => r.status === 'paid').reduce((total, r) => total + r.xp, 0),
  syncedAt: user.githubStats?.syncedAt || null };
}
// Caller owns the shared account lease (sync or mission claim). No writes from public/read routes.
async function reconcileAchievements(db, user, now = new Date()) {
  const rewards = db.collection('achievementRewards');
  const seasons = db.collection('communitySeasons');
  const period = periodFor(now);
  const pending = await rewards.find({ githubId: user.githubId, status: 'pending' }).toArray();
  for (const reward of pending) {
    const credited = await seasons.findOne({ githubId: user.githubId, period: reward.creditedPeriod });
    // The proof is stored atomically with the XP. A retry across months must not pay twice.
    if (credited?.stats?.achievementRewardIds?.includes(reward._id)) {
      await rewards.updateOne({ _id: reward._id, status: 'pending' }, { $set: { status: 'paid', paidAt: now } });
    } else if (reward.creditedPeriod !== period) {
      await rewards.updateOne({ _id: reward._id, status: 'pending' }, { $set: { creditedPeriod: period, awardedAt: now } });
    }
  }
  const { metrics, rewards: existing, legacy } = await achievementState(db, user, now);
  const earned = new Set(existing.map(r => r.achievementId));
  // Add non-level rewards first, then evaluate levels from low to high; bounded, no recursive XP farm.
  const ordered = [...ACHIEVEMENTS.filter(a => a.metric !== 'level'), ...ACHIEVEMENTS.filter(a => a.metric === 'level')];
  let xp = metrics.xp;
  for (const item of ordered) {
    const value = item.metric === 'level' ? progression(xp).level : metrics[item.metric];
    if (earned.has(item.id) || (value < item.target && !legacy.has(item.name))) continue;
    const key = `${user.githubId}:${item.id}:v1`;
    const result = await rewards.updateOne({ _id: key }, { $setOnInsert: { githubId: user.githubId,
      achievementId: item.id, name: item.name, xp: item.xp, version: 1, status: 'pending',
      awardedAt: now, creditedPeriod: period } }, { upsert: true });
    if (result.upsertedCount) xp += item.xp;
  }
  const { updateBonuses } = require('../missions/store');
  await updateBonuses(db, user, now, period);
  const current = await seasons.findOne({ githubId: user.githubId, period });
  for (const id of current?.stats?.achievementRewardIds || []) {
    await rewards.updateOne({ _id: id, githubId: user.githubId, status: 'pending' }, { $set: { status: 'paid', paidAt: now } });
  }
}
module.exports = { ACHIEVEMENTS, achievementMetrics, readAchievements, reconcileAchievements };
