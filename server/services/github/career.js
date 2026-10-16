const { progression } = require('./scoring');
function preserveLegacy(stats, protectedXP = 0) {
  const adjustment = Math.max(0, protectedXP - stats.xp);
  const xp = stats.xp + adjustment;
  return { ...stats, xp, ...progression(xp), breakdown: { ...stats.breakdown, legacyAdjustment: adjustment } };
}
function summarizeCareer(seasons, previousAchievements = []) {
  // One authoritative record per user/month. Recalculation never adds a snapshot twice.
  const unique = new Map(seasons.map((season) => [season.period, season]));
  const records = [...unique.values()];
  const xp = records.reduce((sum, season) => sum + (season.stats?.xp || 0), 0);
  const achievements = [...new Set([...previousAchievements, ...records.flatMap((season) => season.stats?.achievements || [])])];
  const progress = progression(xp);
  if (progress.level >= 5 && !achievements.includes('Nível 5')) achievements.push('Nível 5');
  const positions = records.filter((season) => season.status === 'closed' && season.position).map((season) => season.position);
  return { xp, ...progress, achievements, seasons: records.length,
    bestPosition: positions.length ? Math.min(...positions) : null,
    commits: records.reduce((sum, season) => sum + (season.stats?.commits || 0), 0),
    mergedPRs: records.reduce((sum, season) => sum + (season.stats?.mergedPRs || 0), 0),
    since: records.map((season) => season.period).sort()[0] || null };
}
module.exports = { preserveLegacy, summarizeCareer };
