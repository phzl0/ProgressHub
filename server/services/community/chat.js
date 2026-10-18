const { ObjectId } = require('mongodb');
const { appearanceFor } = require('./cosmetics');
const { channelFor, channelFilter } = require('./social');
const { boundedText } = require('./text-limits');
const { reactionSummaries } = require('./reactions');
const {blockedIds}=require('./safety');
const PAGE = 30;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateMessage(input) {
  if (typeof input?.text !== 'string' || typeof input?.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Mensagem inválida.');
  const text = boundedText(input.text,600,6,Boolean(input.attachmentId));
  if ((!text && !input.attachmentId) || [...text].length > 600 || text.split('\n').length > 6 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw fail('Escreva de 1 a 600 caracteres, em até 6 linhas.');
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
  const reactions = await reactionSummaries(db,'chat',rows.filter(r=>!r.deletedAt).map(r=>r._id.toHexString()),viewer);
  return rows.map(row => {
    const author = authors.get(row.githubId);
    return { ...(reactions.get(row._id.toHexString()) || {likes:0,liked:false,reaction:null,reactions:{}}), id: row._id.toHexString(), text: row.deletedAt ? '' : row.text, deleted: Boolean(row.deletedAt), createdAt: row.createdAt,
      attachment: !row.deletedAt ? row.attachment || null : null, own: row.githubId === viewer.githubId, author: { githubId: row.githubId, login: author?.githubLogin || 'Participante', picture: author?.picture || '',
        profileId: author?.communityOptIn ? author.githubId : null, appearance: appearanceFor(author || {}) } };
  });
}
async function readChat(db, user, query = {}) {
  const channel = await channelFor(db, user, query.channel);
  const hidden=await blockedIds(db,user);
  const scope = {...channelFilter(channel),githubId:{$nin:hidden}};
  const before = parseIds(query.before);
  if (before.length > 1) throw fail('Página inválida.');
  const known = parseIds(query.known);
  const messages = db.collection('communityMessages');
  const page = await messages.find({ ...scope, ...(before.length ? { _id: { $lt: before[0] } } : {}) }).sort({ _id: -1 }).limit(PAGE + 1).toArray();
  const history = page.slice(0, PAGE);
  // Refresh loaded messages too, so another user's deletion removes its text from the open chat.
  const loaded = !before.length && known.length ? await messages.find({ ...scope, _id: { $in: known } }).toArray() : [];
  const rows = [...new Map([...loaded, ...history].map(row => [row._id.toHexString(), row])).values()].sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()));
  const hiddenRows=hidden.length&&known.length?await messages.find({...channelFilter(channel),_id:{$in:known},githubId:{$in:hidden}},{projection:{_id:1}}).toArray():[];
  return { hiddenIds:hiddenRows.map(r=>r._id.toHexString()), messages: await present(db, rows, user), hasOlder: page.length > PAGE, oldest: history.at(-1)?._id.toHexString() || null };
}
async function sendMessage(db, user, input, now = new Date()) {
  const channel = await channelFor(db, user, input.channel);
  if (channel === 'help') throw fail('Abra um pedido de ajuda para iniciar uma conversa.');
  const { text, requestId } = validateMessage(input);
  const messages = db.collection('communityMessages');
  const requestKey = `${user.githubId}:${channel}:${requestId}`;
  const previous = await messages.findOne({ requestKey });
  if (previous) {
    if (previous.attachment && !previous.deletedAt) await db.collection('communityAttachments').updateOne({ _id: new ObjectId(previous.attachment.id), githubId: user.githubId, channel, $or: [{ messageId: { $exists: false } }, { messageId: previous._id.toHexString() }] }, { $set: { messageId: previous._id.toHexString() }, $unset: { expiresAt: '', reservedRequestKey: '' } });
    return (await present(db, [previous], user))[0];
  }
  let attachment = null;
  if (input.attachmentId) {
    if (!channel.startsWith('group:') || typeof input.attachmentId !== 'string' || !/^[a-f0-9]{24}$/.test(input.attachmentId)) throw fail('Anexo inválido.');
    attachment = await db.collection('communityAttachments').findOne({ _id: new ObjectId(input.attachmentId), githubId: user.githubId, channel, $or: [{ messageId: { $exists: false } }, { reservedRequestKey: requestKey }], expiresAt: { $gt: now } }, { projection: { data: 0 } });
    if (!attachment) throw fail('O anexo expirou ou já foi enviado. Selecione o arquivo novamente.');
  }
  if(channel==='general') {
  const lock = await db.collection('users').updateOne({ _id: user._id, $or: [{ chatLastSentAt: { $exists: false } }, { chatLastSentAt: { $lte: new Date(now.getTime() - 5000) } }] }, { $set: { chatLastSentAt: now } });
  if (!lock.modifiedCount) {
    const repeated = await messages.findOne({ requestKey });
    if (repeated) return (await present(db, [repeated], user))[0];
    throw fail('Aguarde 5 segundos antes de enviar outra mensagem.', 429);
  }
  }
  const row = { _id: attachment?.messageId ? new ObjectId(attachment.messageId) : new ObjectId(), requestKey, githubId: user.githubId, channel, text, createdAt: now };
  if (attachment) row.attachment = { id: attachment._id.toHexString(), name: attachment.name, type: attachment.type, size: attachment.size };
  if (attachment) {
    const claimed = await db.collection('communityAttachments').updateOne({ _id: attachment._id, $or: [{ messageId: { $exists: false } }, { reservedRequestKey: requestKey }] }, { $set: { messageId: row._id.toHexString(), reservedRequestKey: requestKey } });
    if (!claimed.matchedCount) throw fail('O anexo já está em outro envio.',409);
  }
  try { await messages.insertOne(row); }
  catch (error) { if (error.code !== 11000) throw error; return (await present(db, [await messages.findOne({ requestKey })], user))[0]; }
  if (attachment) await db.collection('communityAttachments').updateOne({ _id: attachment._id }, { $set: { messageId: row._id.toHexString() }, $unset: { expiresAt: '', reservedRequestKey: '' } });
  return (await present(db, [row], user))[0];
}
async function deleteMessage(db, user, id, now = new Date()) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw fail('Mensagem indisponível.', 404);
  const result = await db.collection('communityMessages').updateOne({ _id: new ObjectId(id), githubId: user.githubId }, { $set: { deletedAt: now }, $unset: { text: '', attachment: '' } });
  if (!result.matchedCount) throw fail('Mensagem indisponível.', 404);
  await db.collection('communityAttachments').deleteMany({ messageId: id, githubId: user.githubId });
  return { id, deleted: true };
}
module.exports = { validateMessage, parseIds, readChat, sendMessage, deleteMessage };
