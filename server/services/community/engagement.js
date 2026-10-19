const { windowFor } = require('../missions/rules');
const GOALS = [
  { id: 'days', label: 'Programar em dias diferentes', unit: 'dias com commits', max: 7, suggested: 3 },
  { id: 'commits', label: 'Fazer commits elegíveis', unit: 'commits', max: 100, suggested: 10 },
  { id: 'merged', label: 'Ter PRs próprios mesclados', unit: 'PRs mesclados', max: 20, suggested: 2 },
  { id: 'reviews', label: 'Revisar PRs de outras pessoas', unit: 'PRs distintos revisados', max: 20, suggested: 2 }
];
function validateGoal(input) {
  const definition = GOALS.find(g => g.id === input?.metric);
  if (!definition || !Number.isInteger(input.target) || input.target < 1 || input.target > definition.max) {
    const error = new Error('Escolha um objetivo e uma quantidade válida.'); error.status = 400; throw error;
  }
  return { metric: definition.id, target: input.target };
}
function goalProgress(goal, events, now = new Date()) {
  const definition = GOALS.find(g => g.id === goal.metric);
  const values = new Set();
  const eligible = events.filter(e => new Date(e.at) >= new Date(goal.createdAt) && new Date(e.at) < new Date(goal.endsAt) && new Date(e.at) <= now).sort((a, b) => a.at.localeCompare(b.at));
  let completedAt = null;
  for (const event of eligible) {
    const kind = ['days', 'commits'].includes(goal.metric) ? 'commit' : goal.metric === 'reviews' ? 'review' : 'merged';
    if (event.kind !== kind) continue;
    values.add(goal.metric === 'days' ? event.at.slice(0, 10) : goal.metric === 'reviews' ? event.prId : event.id);
    if (values.size >= goal.target && !completedAt) completedAt = event.at;
  }
  return { metric: goal.metric, target: goal.target, periodKey: goal.periodKey, createdAt: goal.createdAt, endsAt: goal.endsAt,
    label: definition.label, unit: definition.unit, current: values.size,
    progress: Math.min(100, Math.round(values.size / goal.target * 100)), completedAt };
}
async function readGoal(db, user, now = new Date()) {
  const week = windowFor('weekly', now);
  const goal = await db.collection('personalGoals').findOne({ _id: `${user.githubId}:${week.key}` });
  const events = goal ? await db.collection('missionEvents').find({ githubId: user.githubId, at: { $gte: new Date(goal.createdAt).toISOString(), $lt: week.end.toISOString() } }).toArray() : [];
  const fresh = await db.collection('users').findOne({ _id: user._id });
  return { options: GOALS, periodKey: week.key, endsAt: week.end, goal: goal ? goalProgress(goal, events, now) : null,
    syncedAt: fresh?.missionsSyncedAt || null, partial: Boolean(fresh?.missionsPartial), error: fresh?.missionsError || null };
}
async function createGoal(db, user, input, now = new Date()) {
  const data = validateGoal(input);
  const week = windowFor('weekly', now);
  try {
    await db.collection('personalGoals').insertOne({ _id: `${user.githubId}:${week.key}`, githubId: user.githubId,
      ...data, periodKey: week.key, createdAt: now, endsAt: week.end });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const conflict = new Error('Você já escolheu sua meta desta semana. Uma nova escolha será liberada na próxima segunda-feira.'); conflict.status = 409; throw conflict;
  }
  // Start collecting evidence even when the user has not visited Missions yet.
  await db.collection('users').updateOne({ _id: user._id, missionsStartedAt: { $exists: false } }, { $set: { missionsStartedAt: now } });
  return readGoal(db, user, now);
}
function summarizeWeek(records, rewards, events, now = new Date(), communityRewards = [], achievementRewards = [], range = null) {
  const week = range||windowFor('weekly', now);
  const inWeek = date => new Date(date) >= week.start && new Date(date) < week.end && new Date(date) <= now;
  const days = new Map(); const prs = new Map(); const reviews = new Set();
  let latest = null;
  for (const record of records) {
    const stats = record.stats || {};
    if (stats.syncedAt && (!latest || new Date(stats.syncedAt) > new Date(latest))) latest = stats.syncedAt;
    for (const day of stats.commitDays || []) if (inWeek(`${day.date}T00:00:00Z`)) days.set(day.date, day);
    for (const pr of stats.pullRequests || []) if (inWeek(pr.mergedAt)) prs.set(pr.url, pr);
  }
  for (const event of events) if (event.kind === 'review' && inWeek(event.at)) reviews.add(event.prId);
  const received = rewards.filter(r => inWeek(r.awardedAt));
  const commitXP = [...days.values()].reduce((sum, d) => sum + (d.xp || 0), 0);
  const prXP = [...prs.values()].reduce((sum, pr) => sum + (pr.xp || 0), 0);
  const communityBonusXP = communityRewards.filter(reward => inWeek(reward.awardedAt)).reduce((sum, reward) => sum + reward.xp, 0);
  const achievementBonusXP = achievementRewards.filter(reward => inWeek(reward.awardedAt)).reduce((sum, reward) => sum + reward.xp, 0);
  const bonusXP = received.reduce((sum, r) => sum + r.xp, 0) + communityBonusXP + achievementBonusXP;
  const requiredPeriods = new Set([week.start.toISOString().slice(0,7), new Date(Math.min(now.getTime(),week.end.getTime()-1)).toISOString().slice(0,7)]);
  const partial = [...requiredPeriods].some(period => !records.some(r => r.period === period && r.stats?.detailsVersion >= 2));
  return { startsAt: week.start, endsAt: week.end, syncedAt: latest, partial, commitXP, prXP, bonusXP, communityBonusXP, achievementBonusXP,
    xp: commitXP + prXP + bonusXP, commits: [...days.values()].reduce((sum, d) => sum + (d.credited || 0), 0),
    mergedPRs: prs.size, activeDays: [...days.values()].filter(d => d.credited > 0).length, reviews: reviews.size, receivedMissions: received.length };
}
function summaryRange(query={},now=new Date()){
  const mode=query.mode||'weekly';if(!['daily','weekly','monthly','date'].includes(mode))throw Object.assign(new Error('Período inválido.'),{status:400});
  let start=new Date(now);start.setUTCHours(0,0,0,0);let end;
  if(mode==='date'){if(typeof query.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(query.date))throw Object.assign(new Error('Escolha uma data válida.'),{status:400});start=new Date(`${query.date}T00:00:00Z`);if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==query.date||start>now)throw Object.assign(new Error('Escolha uma data válida, até hoje.'),{status:400});}
  if(mode==='weekly'){const w=windowFor('weekly',now);return {...w,mode};}
  if(mode==='monthly'){start.setUTCDate(1);end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));}else end=new Date(start.getTime()+86400000);
  return {start,end,key:start.toISOString().slice(0,10),mode};
}
async function weeklySummary(db, user, now = new Date(),query={}) {
  const week = summaryRange(query,now);
  const periods = [...new Set([week.start.toISOString().slice(0,7), new Date(Math.min(now.getTime(),week.end.getTime()-1)).toISOString().slice(0,7)])];
  const [records, rewards, events, communityRewards, achievementRewards] = await Promise.all([
    db.collection('communitySeasons').find({ githubId: user.githubId, period: { $in: periods } }).toArray(),
    db.collection('missionRewards').find({ githubId: user.githubId, awardedAt: { $gte: week.start, $lt: week.end } }).toArray(),
    db.collection('missionEvents').find({ githubId: user.githubId, kind: 'review', at: { $gte: week.start.toISOString(), $lt: week.end.toISOString() } }).toArray(),
    db.collection('communityPoolShares').find({ githubId: user.githubId, status: 'paid', awardedAt: { $gte: week.start, $lt: week.end } }).toArray(),
    db.collection('achievementRewards').find({ githubId: user.githubId, status: 'paid', awardedAt: { $gte: week.start, $lt: week.end } }).toArray()
  ]);
  const summary = summarizeWeek(records, rewards, events, now, communityRewards, achievementRewards,week);
  summary.mode=week.mode;
  summary.partial = summary.partial || Boolean(user.missionsPartial || user.missionsError);
  return summary;
}
async function communityChallenge(db, user = null, now = new Date()) {
  const week = windowFor('weekly', now);
  const totals = await db.collection('missionEvents').aggregate([
    { $match: { kind: 'commit', at: { $gte: week.start.toISOString(), $lte: now.toISOString() } } },
    { $lookup: { from: 'users', localField: 'githubId', foreignField: 'githubId', as: 'participant' } },
    { $match: { 'participant.communityOptIn': true } },
    { $group: { _id: '$githubId', commits: { $addToSet: '$id' } } },
    { $project: { commits: { $size: '$commits' } } },
    { $group: { _id: null, current: { $sum: '$commits' }, participants: { $sum: 1 } } }
  ]).toArray();
  const current = totals[0]?.current || 0;
  const mine = user?.communityOptIn ? await db.collection('missionEvents').countDocuments({ githubId: user.githubId, kind: 'commit', at: { $gte: week.start.toISOString(), $lte: now.toISOString() } }) : 0;
  return { periodKey: week.key, startsAt: week.start, endsAt: week.end, target: 100, current, participants: totals[0]?.participants || 0,
    progress: Math.min(100, current), completed: current >= 100, mine, optedIn: Boolean(user?.communityOptIn), checkedAt: now };
}
module.exports = { GOALS, validateGoal, goalProgress, createGoal, readGoal, summarizeWeek, summaryRange, weeklySummary, communityChallenge };
