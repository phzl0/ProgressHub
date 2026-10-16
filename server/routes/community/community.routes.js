const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { connectToDatabase } = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { periodFor } = require('../../services/github/scoring');
const { tokenKey, encryptToken, githubClient, collectStats } = require('../../services/github/client');
const router = express.Router();
const clientURL = () => process.env.CLIENT || 'http://localhost:3000';
const callbackURL = () => process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/community/auth/callback';
const saveSession = (req) => new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
const limiter = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
// Separate public browsing limit avoids consuming login/sync quota when opening profiles.
router.use('/profiles', require('./profiles.routes'));
router.use(limiter);

// Mutations are only accepted from the configured frontend (also prevents CSRF).
function sameOrigin(req, res, next) {
  if (req.get('Origin') !== new URL(clientURL()).origin) return res.status(403).json({ error: 'Origem não autorizada.' });
  next();
}
router.get('/auth', async (req, res) => {
  try {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) throw new Error('Missing configuration');
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 ||
        process.env.SESSION_SECRET === 'development_session_secret_123') throw new Error('Configure a strong session secret');
    tokenKey();
    const state = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    req.session.githubOAuth = { state, verifier, createdAt: Date.now() };
    await saveSession(req);
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: callbackURL(), scope: '', state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (_) { res.redirect(`${clientURL()}/community?error=config`); }
});
router.get('/auth/callback', async (req, res) => {
  const flow = req.session.githubOAuth;
  delete req.session.githubOAuth;
  try {
    await saveSession(req);
    if (!flow || typeof req.query.state !== 'string' || req.query.state !== flow.state ||
        Date.now() - flow.createdAt > 600000 || typeof req.query.code !== 'string') {
      return res.redirect(`${clientURL()}/community?error=oauth`);
    }
    const { data: token } = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: req.query.code, redirect_uri: callbackURL(), code_verifier: flow.verifier
    }, { headers: { Accept: 'application/json' }, timeout: 20000 });
    if (!token.access_token) throw new Error('OAuth failed');
    // This MVP never requests repo permissions; reject accidentally broadened authorization.
    if (token.scope) throw new Error('Use a dedicated OAuth App without private repository scopes');
    const { data: profile } = await githubClient(token.access_token).get('/user');
    if (profile.type !== 'User') throw new Error('Only personal accounts are supported');
    const db = await connectToDatabase();
    const githubId = String(profile.id);
    await db.collection('users').updateOne({ githubId }, {
      $set: { githubLogin: profile.login, githubToken: encryptToken(token.access_token),
        name: profile.name || profile.login, picture: profile.avatar_url, lastLogin: new Date() },
      $setOnInsert: { createdAt: new Date(), communityOptIn: false, xp: 0, level: 1,
        tasks: [], completedTasks: [], unlockedBadges: [], isOptIn: false }
    }, { upsert: true });
    const user = await db.collection('users').findOne({ githubId });
    await new Promise((resolve, reject) => req.login(user, (err) => err ? reject(err) : resolve()));
    await saveSession(req);
    res.redirect(`${clientURL()}/community`);
  } catch (_) { res.redirect(`${clientURL()}/community?error=oauth`); }
});
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const stats = req.user.githubStats?.period === periodFor() ? req.user.githubStats : null;
    let position = null;
    if (req.user.communityOptIn && req.user.githubId && stats) {
      const db = await connectToDatabase();
      position = 1 + await db.collection('users').countDocuments({
        communityOptIn: true, 'githubStats.period': periodFor(),
        $or: [
          { 'githubStats.xp': { $gt: stats.xp } },
          { 'githubStats.xp': stats.xp, githubId: { $lt: req.user.githubId } }
        ]
      });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ connected: Boolean(req.user.githubId), githubId: req.user.githubId, login: req.user.githubLogin,
      name: req.user.name, picture: req.user.picture, optedIn: Boolean(req.user.communityOptIn),
      stats, position });
  } catch (_) { res.status(500).json({ error: 'Não foi possível carregar o perfil.' }); }
});
router.post('/participation', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId || typeof req.body.optedIn !== 'boolean') return res.status(400).json({ error: 'Conecte o GitHub e informe a participação.' });
  try {
    const db = await connectToDatabase();
    await db.collection('users').updateOne({ _id: req.user._id }, { $set: { communityOptIn: req.body.optedIn } });
    res.json({ optedIn: req.body.optedIn });
  } catch (_) { res.status(500).json({ error: 'Não foi possível atualizar sua participação.' }); }
});
router.post('/sync', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para sincronizar.' });
  let users;
  const lockId = crypto.randomUUID();
  try {
    const db = await connectToDatabase();
    users = db.collection('users');
    const now = new Date();
    const period = periodFor(now);
    const lock = await users.updateOne({ _id: req.user._id,
      $and: [
        { $or: [{ syncLockUntil: { $exists: false } }, { syncLockUntil: { $lt: now } }] },
        { $or: [{ 'githubStats.syncedAt': { $exists: false } },
          { 'githubStats.period': { $ne: period } },
          { 'githubStats.syncedAt': { $lt: new Date(now.getTime() - 30000) } }] }
      ]
    }, { $set: { syncLockId: lockId, syncLockUntil: new Date(now.getTime() + 90000) } });
    if (!lock.modifiedCount) return res.status(429).json({ error: 'Aguarde 30 segundos entre sincronizações.' });
    const stats = await collectStats(req.user, period, now);
    const result = await users.updateOne({ _id: req.user._id, syncLockId: lockId }, { $set: { githubStats: stats, githubLogin: stats.login } });
    if (!result.modifiedCount) throw new Error('Sync lock expired');
    res.json(stats);
  } catch (_) {
    // Do not log axios errors: their request configuration contains the access token.
    res.status(502).json({ error: 'Não foi possível sincronizar. Reconecte o GitHub se necessário; sua pontuação anterior foi preservada.' });
  } finally {
    if (users) await users.updateOne({ _id: req.user._id, syncLockId: lockId }, { $unset: { syncLockId: '', syncLockUntil: '' } }).catch(() => {});
  }
});
router.get('/leaderboard', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const period = periodFor();
    const users = await db.collection('users').find({ communityOptIn: true, 'githubStats.period': period }, {
      projection: { _id: 0, githubId: 1, githubLogin: 1, picture: 1,
        'githubStats.xp': 1, 'githubStats.level': 1, 'githubStats.title': 1 }
    }).sort({ 'githubStats.xp': -1, githubId: 1 }).limit(100).toArray();
    res.set('Cache-Control', 'no-store');
    res.json({ period, users });
  } catch (_) { res.status(500).json({ error: 'Não foi possível carregar o ranking.' }); }
});
module.exports = router;
