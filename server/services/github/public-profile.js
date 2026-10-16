const { periodFor } = require('./scoring');

// Explicit allowlist: never return the user document or its full GitHub snapshot.
function publicProfile(user, position = null, now = new Date()) {
  if (!user?.communityOptIn || !/^\d{1,20}$/.test(user.githubId || '')) return null;
  const stats = user.githubStats?.period === periodFor(now) ? user.githubStats : null;
  return {
    githubId: user.githubId,
    login: user.githubLogin,
    picture: user.picture,
    position: stats ? position : null,
    stats: stats ? {
      period: stats.period, xp: stats.xp, level: stats.level,
      experience: stats.experience, nextLevelXP: stats.nextLevelXP,
      commits: stats.commits, mergedPRs: stats.mergedPRs,
      title: stats.title, achievements: stats.achievements || [], syncedAt: stats.syncedAt
    } : null
  };
}
module.exports = { publicProfile };
