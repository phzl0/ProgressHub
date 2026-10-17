const { ObjectId } = require('mongodb');
const { notify } = require('./notifications');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateHelp(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const limit = input.limit;
  if (!title || title.length > 80 || !description || description.length > 2000 || !Number.isInteger(limit) || limit < 2 || limit > 20) throw fail('Informe título (80 caracteres), descrição (2.000) e limite de 2 a 20 participantes.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Pedido inválido.');
  return { title, description, limit, requestId: input.requestId };
}
async function readHelp(db, user, query = {}) {
  const filter = { type: 'help' };
  if (query.before) { if (typeof query.before !== 'string' || !/^[a-f0-9]{24}$/.test(query.before)) throw fail('Página inválida.'); filter._id = { $lt: new ObjectId(query.before) }; }
  const rows = await db.collection('communityGroups').find(filter).sort({ _id: -1 }).limit(21).toArray();
  const users = await db.collection('users').find({ githubId: { $in: rows.map(r => r.owner) } }, { projection: { githubId: 1, githubLogin: 1 } }).toArray();
  return { requests: rows.slice(0,20).map(r => ({ id: r._id.toHexString(), title: r.name, description: r.description, status: r.helpStatus, limit: r.helpLimit, count: r.members.length, joined: r.members.includes(user.githubId), own: r.owner === user.githubId, author: users.find(u => u.githubId === r.owner)?.githubLogin || 'Participante', createdAt: r.createdAt })), hasMore: rows.length > 20 };
}
async function helpAction(db, user, input) {
  const groups = db.collection('communityGroups');
  if (input.action === 'create') {
    const value = validateHelp(input); const requestKey = `help:${user.githubId}:${value.requestId}`;
    const existing = await groups.findOne({ requestKey }); if (existing) return { id: existing._id.toHexString() };
    if (await groups.countDocuments({ owner: user.githubId, type: 'help', helpStatus: { $ne: 'resolved' } }) >= 5) throw fail('Encerre um dos seus cinco pedidos antes de abrir outro.');
    const result = await groups.updateOne({ requestKey }, { $setOnInsert: { type: 'help', name: value.title, description: value.description, helpLimit: value.limit, helpStatus: 'open', owner: user.githubId, members: [user.githubId], invited: [], createdAt: new Date() } }, { upsert: true });
    const row = result.upsertedId ? { _id: result.upsertedId } : await groups.findOne({ requestKey }); return { id: row._id.toHexString() };
  }
  if (typeof input.id !== 'string' || !/^[a-f0-9]{24}$/.test(input.id)) throw fail('Pedido indisponível.',404);
  const _id = new ObjectId(input.id); const group = await groups.findOne({ _id, type: 'help' });
  if (!group) throw fail('Pedido indisponível.',404);
  if (input.action === 'join') {
    if (group.members.includes(user.githubId)) return { id: input.id };
    const result = await groups.updateOne({ _id, helpStatus: 'open', members: { $ne: user.githubId }, $expr: { $lt: [{ $size: '$members' }, '$helpLimit'] } }, { $addToSet: { members: user.githubId } });
    if (!result.modifiedCount) throw fail('O pedido está encerrado ou atingiu o limite de participantes.',409);
    await notify(db, group.owner, `help-join:${input.id}:${user.githubId}`, 'Alguém chegou para ajudar', `@${user.githubLogin} entrou em “${group.name}”.`, `#community/groups/${input.id}`);
  } else if (input.action === 'status') {
    if (group.owner !== user.githubId) throw fail('Apenas o autor pode encerrar o pedido.',403);
    if (!['open','paused','resolved'].includes(input.status)) throw fail('Estado inválido.');
    await groups.updateOne({ _id, owner: user.githubId }, { $set: { helpStatus: input.status } });
    if (input.status === 'resolved') await Promise.all(group.members.filter(m => m !== user.githubId).map(m => notify(db,m,`help-resolved:${input.id}`,'Pedido resolvido',`“${group.name}” foi marcado como resolvido.`,`#community/groups/${input.id}`)));
  } else throw fail('Ação inválida.');
  return { id: input.id };
}
module.exports = { validateHelp, readHelp, helpAction };
