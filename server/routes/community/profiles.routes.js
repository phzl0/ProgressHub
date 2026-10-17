const express = require('express');
const rateLimit = require('express-rate-limit');
const { connectToDatabase } = require('../../db');
const { periodFor } = require('../../services/github/scoring');
const { careerFor } = require('../../services/github/league');
const { publicProfile } = require('../../services/github/public-profile');
const router = express.Router();
router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
router.get('/:githubId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!/^\d{1,20}$/.test(req.params.githubId)) return res.status(404).json({ error: 'Perfil indisponível.' });
  try {
    const db = await connectToDatabase();
    const users = db.collection('users');
    const user = await users.findOne({ githubId: req.params.githubId, communityOptIn: true }, {
      projection: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityOptIn: 1, communityProfile: 1, 'career.achievements': 1,
        'githubStats.period': 1, 'githubStats.xp': 1, 'githubStats.level': 1,
        'githubStats.experience': 1, 'githubStats.nextLevelXP': 1,
        'githubStats.commits': 1, 'githubStats.mergedPRs': 1,
        'githubStats.title': 1, 'githubStats.achievements': 1, 'githubStats.syncedAt': 1 }
    });
    if (!user) return res.status(404).json({ error: 'Perfil indisponível.' });
    const now = new Date();
    let position = null;
    if (user.githubStats?.period === periodFor(now)) {
      position = 1 + await users.countDocuments({
        communityOptIn: true, 'githubStats.period': periodFor(now),
        $or: [ { 'githubStats.xp': { $gt: user.githubStats.xp } },
          { 'githubStats.xp': user.githubStats.xp, githubId: { $lt: user.githubId } } ]
      });
    }
    user.career = await careerFor(db, user, false);
    const profile = publicProfile(user, position, now);
    if (!profile) return res.status(404).json({ error: 'Perfil indisponível.' });
    res.json(profile);
  } catch (_) { res.status(503).json({ error: 'Não foi possível carregar o perfil. Tente novamente.' }); }
});
module.exports = router;
