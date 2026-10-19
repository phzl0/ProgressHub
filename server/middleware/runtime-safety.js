function sessionSecret(env) {
  const value = env.SESSION_SECRET;
  if (typeof value !== 'string' || value.length < 32 ||
      ['fallback_secret', 'development_session_secret_123'].includes(value)) {
    throw new Error('Configure SESSION_SECRET with at least 32 characters before starting the server.');
  }
  return value;
}
function apiError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'O conteúdo enviado excede o limite permitido.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'O conteúdo enviado não é um JSON válido.' });
  // Never expose stack traces, request bodies, tokens or raw provider errors.
  console.error('API request failed.');
  res.status(500).json({ error: 'Não foi possível concluir a operação. Tente novamente.' });
}
module.exports = { sessionSecret, apiError };
