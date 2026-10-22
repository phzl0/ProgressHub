const router = require('express').Router();
router.use('/community', require('./community/community.routes'));
router.post('/auth/logout', (req, res, next) => {
  const origin = process.env.CLIENT || 'http://localhost:3000';
  if (req.get('Origin') !== new URL(origin).origin) return res.status(403).json({ error: 'Origem inválida.' });
  req.logout(error => {
    if (error) return next(error);
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('connect.sid', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      res.json({ message: 'Sessão encerrada.' });
    });
  });
});
router.get('/auth/logout', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST para encerrar a sessão.' }));
router.get('/auth/current_user', require('../middleware/auth').authenticateToken, (req, res) => res.json({
  userId: req.user._id, name: req.user.name, picture: req.user.picture
}));
router.use('/auth', (req, res) => res.status(410).json({ error: 'Use o acesso pelo GitHub no Progress Hub.' }));
router.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
module.exports = router;
