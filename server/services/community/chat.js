const { ObjectId } = require('mongodb');
const { appearanceFor } = require('./cosmetics');
const { channelFor, channelFilter } = require('./social');
const PAGE = 30;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateMessage(input) {
  if (typeof input?.text !== 'string' || typeof input?.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Mensagem inválida.');
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  if (!text || [...text].length > 600 || text.split('\n').length > 6 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw fail('Escreva de 1 a 600 caracteres, em até 6 linhas.');
  return { text, requestId: input.requestId };
}
function parseIds(value) {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw fail('Consulta de mensagens inválida.');
  const ids = [...new Set(value.split(','))];
  if (ids.length > 180 || ids.some(id => !/^[a-f0-9]{24}$/.test(id))) throw fail('Consulta de mensagens inválida.');
  return ids.map(id => new ObjectId(id));
}
async function present(db, rows, viewer) {
  const ids = [...new Set(rows.map(row => row.githubId))];
  const people = await db.collection('users').find({ githubId: { $in: ids } }, { projection: { _id: 0, githubId: 1, githubLogin: 1, picture: 1, communityOptIn: 1, communityAppearance: 1 } }).toArray();
  const authors = new Map(people.map(person => [person.githubId, person]));
  return rows.map(row => {
    const author = authors.get(row.githubId);
    return { id: row._id.toHexString(), text: row.deletedAt ? '' : row.text, deleted: Boolean(row.deletedAt), createdAt: row.createdAt,
      own: row.githubId === viewer.githubId, author: { login: author?.githubLogin || 'Participante', picture: author?.picture || '',
        profileId: author?.communityOptIn ? author.githubId : null, appearance: appearanceFor(author || {}) } };
  });
}
async function readChat(db, user, query = {}) {
  const channel = await channelFor(db, user, query.channel);
  const scope = channelFilter(channel);
  const before = parseIds(query.before);
  if (before.length > 1) throw fail('Página inválida.');
  const known = parseIds(query.known);
  const messages = db.collection('communityMessages');
  const page = await messages.find({ ...scope, ...(before.length ? { _id: { $lt: before[0] } } : {}) }).sort({ _id: -1 }).limit(PAGE + 1).toArray();
  const history = page.slice(0, PAGE);
  // Refresh loaded messages too, so another user's deletion removes its text from the open chat.
  const loaded = !before.length && known.length ? await messages.find({ ...scope, _id: { $in: known } }).toArray() : [];
  const rows = [...new Map([...loaded, ...history].map(row => [row._id.toHexString(), row])).values()].sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()));
  return { messages: await present(db, rows, user), hasOlder: page.length > PAGE, oldest: history.at(-1)?._id.toHexString() || null };
}
async function sendMessage(db, user, input, now = new Date()) {
  const channel = await channelFor(db, user, input.channel);
  const { text, requestId } = validateMessage(input);
  const messages = db.collection('communityMessages');
  const requestKey = `${user.githubId}:${channel}:${requestId}`;
  const previous = await messages.findOne({ requestKey });
  if (previous) return (await present(db, [previous], user))[0];
  const lock = await db.collection('users').updateOne({ _id: user._id, $or: [{ chatLastSentAt: { $exists: false } }, { chatLastSentAt: { $lte: new Date(now.getTime() - 5000) } }] }, { $set: { chatLastSentAt: now } });
  if (!lock.modifiedCount) {
    const repeated = await messages.findOne({ requestKey });
    if (repeated) return (await present(db, [repeated], user))[0];
    throw fail('Aguarde 5 segundos antes de enviar outra mensagem.', 429);
  }
  const row = { _id: new ObjectId(), requestKey, githubId: user.githubId, channel, text, createdAt: now };
  try { await messages.insertOne(row); }
  catch (error) { if (error.code !== 11000) throw error; return (await present(db, [await messages.findOne({ requestKey })], user))[0]; }
  return (await present(db, [row], user))[0];
}
async function deleteMessage(db, user, id, now = new Date()) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw fail('Mensagem indisponível.', 404);
  const result = await db.collection('communityMessages').updateOne({ _id: new ObjectId(id), githubId: user.githubId }, { $set: { deletedAt: now }, $unset: { text: '' } });
  if (!result.matchedCount) throw fail('Mensagem indisponível.', 404);
  return { id, deleted: true };
}
module.exports = { validateMessage, parseIds, readChat, sendMessage, deleteMessage };
