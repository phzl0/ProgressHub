const RULES_VERSION = 2;
function periodFor(now = new Date()) { return now.toISOString().slice(0, 7); }
function periodBounds(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid season');
  const [year, month] = period.split('-').map(Number);
  return { from: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}
function progression(xp) {
  let level = 1;
  let experience = Math.max(0, Number(xp) || 0);
  while (experience >= level * 200) { experience -= level * 200; level += 1; }
  return { level, experience, nextLevelXP: level * 200,
    title: level >= 10 ? 'Veterano' : level >= 5 ? 'Construtor' : 'Explorador' };
}
// Null merger (deleted user) and automation do not receive the collaboration bonus.
function collaborativePR(pr, login) {
  return pr.mergerType === 'User' && Boolean(pr.mergedBy) && pr.mergedBy.toLowerCase() !== login.toLowerCase();
}
function scoreContributions(days, mergedPRs, collaborationCount = 0) {
  const commits = days.reduce((sum, count) => sum + Math.min(20, Math.max(0, count)), 0);
  const pulls = Math.min(100, Math.max(0, mergedPRs));
  const collaborated = Math.min(pulls, Math.max(0, collaborationCount));
  const xp = commits * 10 + pulls * 50 + collaborated * 25;
  const progress = progression(xp);
  return {
    xp, ...progress, commits, mergedPRs: pulls,
    breakdown: {
      commitXP: commits * 10, pullRequestXP: pulls * 50 + collaborated * 25,
      collaborationBonus: collaborated * 25, collaborativePRs: collaborated,
      detectedCommits: days.reduce((sum, count) => sum + Math.max(0, count), 0),
      detectedMergedPRs: Math.max(0, mergedPRs),
      ignoredCommits: days.reduce((sum, count) => sum + Math.max(0, count - 20), 0),
      ignoredMergedPRs: Math.max(0, mergedPRs - 100), legacyAdjustment: 0
    },
    achievements: [
      ...(commits > 0 ? ['Primeiro commit'] : []),
      ...(pulls > 0 ? ['Primeiro PR mesclado'] : []),
      ...(commits >= 50 ? ['50 commits no mês'] : []),
      ...(progress.level >= 5 ? ['Nível 5'] : [])
    ]
  };
}
module.exports = { RULES_VERSION, periodFor, periodBounds, progression, collaborativePR, scoreContributions };
