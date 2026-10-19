const router = require('express').Router();
// Original task-sharing, AI and external integrations remain in source only.
// They require a separate authorization review before any future reactivation.
router.use('/community', require('./community/community.routes'));
router.use('/auth', (req, res, next) => {
  if (!['/logout', '/current_user'].includes(req.path)) {
    return res.status(410).json({ error: 'Use o acesso pelo GitHub no Progress Hub.' });
  }
  next();
}, require('./auth/auth.routes'));
router.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
module.exports = router;
