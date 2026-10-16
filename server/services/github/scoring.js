// Monthly competition uses UTC boundaries and GitHub-recognized contributions.
function periodFor(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function scoreContributions(days, mergedPRs) {
  const commits = days.reduce((sum, count) => sum + Math.min(20, Math.max(0, count)), 0);
  const pulls = Math.min(100, Math.max(0, mergedPRs));
  const xp = commits * 10 + pulls * 50;
  // Same progression as QuestLog's XPManager, now calculated on the server.
  let level = 1;
  let experience = xp;
  while (experience >= level * 200) {
    experience -= level * 200;
    level += 1;
  }
  return {
    xp, level, experience, nextLevelXP: level * 200,
    commits, mergedPRs: pulls,
    title: level >= 10 ? 'Veterano' : level >= 5 ? 'Construtor' : 'Explorador',
    achievements: [
      ...(commits > 0 ? ['Primeiro commit'] : []),
      ...(pulls > 0 ? ['Primeiro PR mesclado'] : []),
      ...(commits >= 50 ? ['50 commits no mês'] : []),
      ...(level >= 5 ? ['Nível 5'] : [])
    ]
  };
}
module.exports = { periodFor, scoreContributions };
