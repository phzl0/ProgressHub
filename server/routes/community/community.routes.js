const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { connectToDatabase } = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { periodFor } = require('../../services/github/scoring');
const { tokenKey, encryptToken, githubClient } = require('../../services/github/client');
const { readMissions, claimMission } = require('../../services/missions/store');
const { careerFor, syncSeason, seasonHistory } = require('../../services/github/league');
const { validateProfile, profileSettings } = require('../../services/github/profile-settings');
const { weeklySummary } = require('../../services/community/engagement');
const { readProjectGoal, createProjectGoal, updateProjectGoal } = require('../../services/community/project-goals');
const { CATALOG, validateAppearance, appearanceFor } = require('../../services/community/cosmetics');
const { poolView, setParticipation, ensurePool } = require('../../services/community/pool');
const { careerRanking } = require('../../services/community/career-ranking');
const router = express.Router();
const clientURL = () => process.env.CLIENT || 'http://localhost:3000';
const callbackURL = () => process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/community/auth/callback';
const saveSession = (req) => new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
const limitOptions = { windowMs: 60000, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente.' } };
const writeLimiter = rateLimit({ ...limitOptions, limit: 30 });
const authLimiter = rateLimit({ ...limitOptions, limit: 10 });
const readLimiter = rateLimit({ ...limitOptions, limit: 120 });
router.use('/profiles', require('./profiles.routes'));
router.use((req, res, next) => req.path.startsWith('/auth') ? authLimiter(req, res, next)
  : req.method === 'GET' ? readLimiter(req, res, next) : writeLimiter(req, res, next));

// Suspensions restrict community mutations, while preserving browsing and safety controls.
router.use(async(req,res,next)=>{
  if(req.method!=='POST'||req.path.startsWith('/auth')||['/safety','/inbox'].includes(req.path)||!req.isAuthenticated?.()||!req.user?.githubId||req.get('Origin')!==new URL(clientURL()).origin)return next();
  try{await require('../../services/community/permissions').assertCanWrite(await connectToDatabase(),req.user);next();}
  catch(e){res.status(e.status||503).json({error:e.status?e.message:'Não foi possível verificar sua conta.'});}
});

// Mutations are only accepted from the configured frontend (also prevents CSRF).
function sameOrigin(req, res, next) {
  if (req.get('Origin') !== new URL(clientURL()).origin) return res.status(403).json({ error: 'Origem não autorizada.' });
  next();
}
// Chat uses the same authenticated session, origin validation and rate limits as other community actions.
const chat = require('../../services/community/chat');
const githubOnly = (req, res, next) => req.user.githubId ? next() : res.status(400).json({ error: 'Entre com GitHub para acessar o chat.' });
router.get('/chat', authenticateToken, githubOnly, async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await chat.readChat(await connectToDatabase(), req.user, req.query)); }
  catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível carregar o chat.' }); }
});
router.post('/chat', authenticateToken, githubOnly, sameOrigin, async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ message: await chat.sendMessage(await connectToDatabase(), req.user, req.body) }); }
  catch (error) { if (error.status === 429) res.set('Retry-After', '5'); res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível enviar. Tente novamente.' }); }
});
router.post('/chat/delete', authenticateToken, githubOnly, sameOrigin, async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await chat.deleteMessage(await connectToDatabase(), req.user, req.body.id)); }
  catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível apagar a mensagem.' }); }
});
const social = require('../../services/community/social');
for (const [path, read, write] of [['admin', require('../../services/community/admin').readAdmin, require('../../services/community/admin').adminAction], ['social', social.readSocial, social.socialAction], ['feed', social.readFeed, social.feedAction], ['inbox', require('../../services/community/notifications').readInbox, require('../../services/community/notifications').inboxAction], ['help', require('../../services/community/help').readHelp, require('../../services/community/help').helpAction], ['safety', require('../../services/community/safety').readSafety, require('../../services/community/safety').safetyAction]]) {
  router.get(`/${path}`, authenticateToken, githubOnly, async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await read(await connectToDatabase(), req.user, req.query)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível carregar. Tente novamente.' }); }
  });
  router.post(`/${path}`, authenticateToken, githubOnly, sameOrigin, async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await write(await connectToDatabase(), req.user, req.body)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Não foi possível salvar. Tente novamente.' }); }
  });
}
router.get('/search',authenticateToken,githubOnly,async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await require('../../services/community/search').searchCommunity(await connectToDatabase(),req.user,req.query));}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Não foi possível pesquisar.'});}
});
router.post('/reactions',authenticateToken,githubOnly,sameOrigin,async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await require('../../services/community/reactions').react(await connectToDatabase(),req.user,req.body));}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Não foi possível reagir.'});}
});
router.get('/help/comments',authenticateToken,githubOnly,async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await require('../../services/community/comments').readComments(await connectToDatabase(),req.user,{...req.query,helpId:req.query.helpId||''}));}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Não foi possível carregar os comentários.'});}
});
router.get('/feed/comments', authenticateToken, githubOnly, async (req,res) => {
  try { res.set('Cache-Control','no-store').json(await require('../../services/community/comments').readComments(await connectToDatabase(),req.user,req.query)); }
  catch(error) { res.status(error.status||503).json({error:error.status?error.message:'Não foi possível carregar os comentários.'}); }
});
const attachments = require('../../services/community/attachments');
router.post('/chat/attachments', authenticateToken, githubOnly, sameOrigin, express.raw({type:'application/octet-stream',limit:'10mb'}), async (req,res) => {
  try { res.set('Cache-Control','no-store').json(await attachments.uploadFile(await connectToDatabase(),req.user,req.query,req.body)); }
  catch(error) { res.status(error.status||503).json({error:error.status?error.message:'Não foi possível anexar o arquivo.'}); }
});
router.post('/chat/attachments/delete', authenticateToken, githubOnly, sameOrigin, async (req,res) => {
  if (typeof req.body.id !== 'string' || !/^[a-f0-9]{24}$/.test(req.body.id)) return res.status(400).json({error:'Anexo inválido.'});
  try { const db=await connectToDatabase(); await db.collection('communityAttachments').deleteOne({_id:new (require('mongodb').ObjectId)(req.body.id),githubId:req.user.githubId,messageId:{$exists:false}}); res.json({ok:true}); }
  catch (_) { res.status(503).json({error:'Não foi possível remover o anexo.'}); }
});
router.get('/chat/attachments/:id', authenticateToken, githubOnly, async (req,res) => {
  try { const file=await attachments.readFile(await connectToDatabase(),req.user,req.params.id); res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':file.type,'Content-Disposition':`${file.type.startsWith('image/')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`}).send(Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer)); }
  catch(error) { res.status(error.status||503).json({error:error.status?error.message:'Não foi possível baixar o arquivo.'}); }
});
router.use((error,req,res,next) => { if(error.type==='entity.too.large') return res.status(413).json({error:'O arquivo deve ter até 10 MB.'}); next(error); });
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
    const db = await connectToDatabase();
    const career = req.user.githubId ? await careerFor(db, req.user) : null;
    res.set('Cache-Control', 'no-store');
    res.json({ connected: Boolean(req.user.githubId), githubId: req.user.githubId, login: req.user.githubLogin,
      adminRole: require('../../services/community/permissions').roleFor(req.user), suspension: require('../../services/community/permissions').suspensionFor(req.user), name: req.user.name, picture: req.user.picture, optedIn: Boolean(req.user.communityOptIn),
      profile: profileSettings(req.user), appearance: appearanceFor(req.user), stats, position, career, backgroundSyncError: req.user.backgroundSyncError || null });
  } catch (_) { res.status(500).json({ error: 'Não foi possível carregar o perfil.' }); }
});
router.get('/achievements', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para acompanhar as conquistas.' });
  try {
    const db = await connectToDatabase();
    res.set('Cache-Control', 'no-store').json(await require('../../services/community/achievements').readAchievements(db, req.user));
  } catch (_) { res.status(503).json({ error: 'Não foi possível carregar as conquistas.' }); }
});
router.get('/cosmetics', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para personalizar sua aparência.' });
  res.set('Cache-Control', 'no-store').json({ catalog: CATALOG, appearance: appearanceFor(req.user) });
});
router.post('/cosmetics', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para personalizar sua aparência.' });
  try {
    const appearance = validateAppearance(req.body);
    const db = await connectToDatabase();
    await db.collection('users').updateOne({ _id: req.user._id }, { $set: { communityAppearance: appearance } });
    res.set('Cache-Control', 'no-store').json({ appearance });
  } catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? error.message : 'Não foi possível salvar sua aparência.' }); }
});
router.get('/community-ranking', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para acompanhar sua contribuição.' });
  try { res.set('Cache-Control', 'no-store').json(await poolView(await connectToDatabase(), req.user)); }
  catch (_) { res.status(503).json({ error: 'Não foi possível carregar o ranking comunitário.' }); }
});
router.post('/profile', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para editar seu perfil.' });
  try {
    const profile = validateProfile(req.body);
    const db = await connectToDatabase();
    const bannerChanged = profile.banner !== (req.user.communityProfile?.banner || '');
    await db.collection('users').updateOne({ _id: req.user._id }, { $set: { communityProfile: profile, ...(bannerChanged ? { 'communityAppearance.cover': 'custom' } : {}) } });
    const fresh = await db.collection('users').findOne({ _id: req.user._id }, { projection: { communityAppearance: 1 } });
    const appearance = appearanceFor(fresh);
    res.set('Cache-Control', 'no-store').json({ profile, appearance });
  } catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? error.message : 'Não foi possível salvar seu perfil.' }); }
});
router.post('/participation', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId || typeof req.body.optedIn !== 'boolean') return res.status(400).json({ error: 'Conecte o GitHub e informe a participação.' });
  try {
    const db = await connectToDatabase();
    await setParticipation(db, req.user, req.body.optedIn);
    await db.collection('communitySeasons').updateOne({ githubId: req.user.githubId, period: periodFor(), status: 'open' }, { $set: { eligible: req.body.optedIn } });
    res.json({ optedIn: req.body.optedIn });
  } catch (_) { res.status(500).json({ error: 'Não foi possível atualizar sua participação.' }); }
});
router.post('/sync', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para sincronizar.' });
  try {
    const db = await connectToDatabase();
    await ensurePool(db);
    const result = await syncSeason(db, req.user);
    res.json(result.stats || { skipped: true });
  } catch (error) {
    res.status(error.status === 429 ? 429 : 502).json({ error: error.status === 429
      ? error.message : 'Não foi possível sincronizar. Reconecte o GitHub se necessário; sua pontuação foi preservada.' });
  }
});
router.get('/goals', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para acompanhar metas.' });
  try { res.set('Cache-Control', 'no-store').json(await readProjectGoal(await connectToDatabase(), req.user)); }
  catch (_) { res.status(503).json({ error: 'Não foi possível carregar sua meta.' }); }
});
router.post('/goals', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para definir sua meta.' });
  try { res.set('Cache-Control', 'no-store').json(await createProjectGoal(await connectToDatabase(), req.user, req.body)); }
  catch (error) { res.status([400, 409].includes(error.status) ? error.status : 503).json({ error: error.status ? error.message : 'Não foi possível salvar sua meta.' }); }
});
router.post('/goals/update', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para atualizar metas.' });
  try { res.set('Cache-Control', 'no-store').json(await updateProjectGoal(await connectToDatabase(), req.user, req.body)); }
  catch (error) { res.status([400, 409].includes(error.status) ? error.status : 503).json({ error: error.status ? error.message : 'Não foi possível salvar a etapa.' }); }
});
router.get('/weekly-summary', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para ver seu resumo.' });
  try { res.set('Cache-Control', 'no-store').json(await weeklySummary(await connectToDatabase(), req.user)); }
  catch (_) { res.status(503).json({ error: 'Não foi possível carregar o resumo semanal.' }); }
});
router.get('/challenge', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para acompanhar o desafio.' });
  try {
    const value = await poolView(await connectToDatabase(), req.user);
    res.set('Cache-Control', 'no-store').json({ ...value, current: value.total, completed: value.total >= value.target,
      progress: Math.min(100, Math.round(value.total / value.target * 100)), mine: value.me?.contributions || 0, optedIn: Boolean(req.user.communityOptIn) });
  }
  catch (_) { res.status(503).json({ error: 'Não foi possível carregar o desafio coletivo.' }); }
});
router.get('/missions', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para acompanhar as missões.' });
  try {
    const db = await connectToDatabase();
    res.set('Cache-Control', 'no-store');
    res.json(await readMissions(db, req.user));
  } catch (_) { res.status(503).json({ error: 'Não foi possível carregar as missões.' }); }
});
router.post('/missions/claim', authenticateToken, sameOrigin, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub para receber.' });
  try {
    const db = await connectToDatabase();
    res.set('Cache-Control', 'no-store');
    res.json(await claimMission(db, req.user, req.body.missionId, req.body.periodKey));
  } catch (error) {
    res.status([400, 409].includes(error.status) ? error.status : 503).json({
      error: error.status ? error.message : 'Não foi possível confirmar o recebimento. Tente novamente.'
    });
  }
});
router.get('/seasons', authenticateToken, async (req, res) => {
  if (!req.user.githubId) return res.status(400).json({ error: 'Entre com GitHub.' });
  try {
    const db = await connectToDatabase();
    res.set('Cache-Control', 'no-store');
    res.json({ seasons: await seasonHistory(db, req.user) });
  } catch (_) { res.status(503).json({ error: 'Não foi possível carregar as temporadas.' }); }
});
router.get('/sync-status', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const job = await db.collection('communityJobs').findOne({ _id: 'github-sync' });
    const heartbeatAt = job?.leaseUntil ? new Date(new Date(job.leaseUntil).getTime() - 180000) : null;
    const lastSeen = Math.max(new Date(job?.completedAt || 0).getTime(), heartbeatAt?.getTime() || 0);
    res.set('Cache-Control', 'no-store');
    res.json({ active: Boolean(lastSeen && Date.now() - lastSeen < 15 * 60000),
      status: job?.status || 'not_started', lastCycleAt: job?.completedAt || null });
  } catch (_) { res.status(503).json({ error: 'Não foi possível consultar a atualização automática.' }); }
});
router.get('/career-leaderboard', async (req, res) => {
  try {
    const db = await connectToDatabase();
    res.set('Cache-Control', 'no-store').json(await careerRanking(db));
  } catch (_) { res.status(503).json({ error: 'Não foi possível carregar o ranking de carreira.' }); }
});
router.get('/leaderboard', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const period = periodFor();
    const users = await db.collection('users').find({ communityOptIn: true, 'githubStats.period': period }, {
      projection: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityAppearance: 1,
        'githubStats.xp': 1, 'githubStats.level': 1, 'githubStats.title': 1,
        'career.level': 1, 'career.title': 1 }
    }).sort({ 'githubStats.xp': -1, githubId: 1 }).limit(100).toArray();
    res.set('Cache-Control', 'no-store');
    res.json({ period, users: users.map(({ communityAppearance, ...user }) => ({ ...user, appearance: appearanceFor({ communityAppearance }) })) });
  } catch (_) { res.status(500).json({ error: 'Não foi possível carregar o ranking.' }); }
});
module.exports = router;
