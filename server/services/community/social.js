const { ObjectId } = require('mongodb');
const { notify } = require('./notifications');
const REACTIONS = ['heart', 'like', 'laugh', 'sad'];
const { appearanceFor } = require('./cosmetics');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = value => { if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw fail('Item indisponível.', 404); return new ObjectId(value); };
const text = (value, max, optional = false) => { if (typeof value !== 'string' || (!optional && !value.trim()) || [...value.trim()].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw fail(`Use até ${max} caracteres.`); return value.trim(); };
const person = user => ({ githubId: user.githubId, login: user.githubLogin, picture: user.picture || '', profileId: user.communityOptIn ? user.githubId : null, appearance: appearanceFor(user) });
const pairKey = (a, b) => [a, b].sort().join(':');
async function people(db, ids) { return new Map((await db.collection('users').find({ githubId: { $in: ids } }, { projection: { githubId: 1, githubLogin: 1, picture: 1, communityOptIn: 1, communityAppearance: 1 } }).toArray()).map(u => [u.githubId, person(u)])); }
async function channelFor(db, user, value = 'general') {
  if (['general', 'help'].includes(value)) return value;
  if (typeof value !== 'string' || !value.startsWith('group:')) throw fail('Conversa indisponível.', 404);
  if (!await db.collection('communityGroups').findOne({ _id: id(value.slice(6)), members: user.githubId })) throw fail('Você não participa deste grupo.', 403);
  return value;
}
function channelFilter(channel) { return channel === 'general' ? { $or: [{ channel: 'general' }, { channel: { $exists: false } }] } : { channel }; }
async function readSocial(db, user) {
  const contacts = await db.collection('communityContacts').find({ $or: [{ from: user.githubId }, { to: user.githubId }] }).limit(100).toArray();
  const groups = await db.collection('communityGroups').find({ $or: [{ members: user.githubId }, { invited: user.githubId }] }).limit(50).toArray();
  const authors = await people(db, [...new Set(contacts.flatMap(c => [c.from, c.to]).concat(groups.flatMap(g => [g.owner, ...g.members, ...g.invited])))]);
  return { contacts: contacts.map(c => ({ id: String(c._id), status: c.status, incoming: c.to === user.githubId, person: authors.get(c.from === user.githubId ? c.to : c.from) })), groups: groups.map(g => ({ id: g._id.toHexString(), name: g.name, description: g.description, type: g.type || 'group', owner: g.owner === user.githubId, joined: g.members.includes(user.githubId), members: g.members.map(m => authors.get(m)).filter(Boolean) })) };
}
async function socialAction(db, user, input) {
  const contacts = db.collection('communityContacts'); const groups = db.collection('communityGroups');
  if (input.action === 'contact-request') {
    const login = text(input.login, 39).replace(/^@/, '');
    if (!/^[a-zA-Z0-9-]+$/.test(login)) throw fail('Informe o nome de usuário do GitHub.');
    const target = await db.collection('users').findOne({ githubLogin: { $regex: `^${login}$`, $options: 'i' }, githubId: { $exists: true } });
    if (!target || target.githubId === user.githubId) throw fail('Escolha outro usuário que já entrou no Progress Hub.');
    const key = pairKey(user.githubId, target.githubId);
    const invitation = await contacts.updateOne({ _id: key }, { $setOnInsert: { from: user.githubId, to: target.githubId, status: 'pending', createdAt: new Date() } }, { upsert: true });
    if (invitation.upsertedCount) await notify(db, target.githubId, `contact:${key}:${Date.now()}`, 'Convite de contato', `@${user.githubLogin} quer adicionar você.`, '#community/invitations');
  } else if (input.action === 'contact-accept') {
    const invitation = await contacts.findOne({ _id: String(input.id), to: user.githubId, status: 'pending' });
    const accepted = await contacts.updateOne({ _id: String(input.id), to: user.githubId, status: 'pending' }, { $set: { status: 'accepted' } });
    if (invitation && accepted.modifiedCount) await notify(db, invitation.from, `contact-accepted:${input.id}:${Date.now()}`, 'Contato adicionado', `@${user.githubLogin} aceitou seu convite.`, '#community/contacts');
  } else if (input.action === 'contact-remove') {
    await contacts.deleteOne({ _id: String(input.id), $or: [{ from: user.githubId }, { to: user.githubId }] });
  } else if (input.action === 'group-create') {
    if (await groups.countDocuments({ owner: user.githubId }) >= 10) throw fail('Limite de 10 grupos por criador.');
    await groups.insertOne({ name: text(input.name, 60), description: text(input.description || '', 240, true), owner: user.githubId, members: [user.githubId], invited: [], createdAt: new Date() });
  } else if (input.action === 'group-invite') {
    const group = await groups.findOne({ _id: id(input.id), owner: user.githubId });
    if (!group) throw fail('Apenas o criador pode convidar.', 403);
    if (group.type === 'help') throw fail('Entre no grupo pela página do pedido de ajuda.');
    const target = String(input.githubId);
    if (!await contacts.findOne({ _id: pairKey(user.githubId, target), status: 'accepted' })) throw fail('Adicione e confirme o contato antes de convidar.');
    if (group.members.length + group.invited.length >= 50) throw fail('Este grupo atingiu 50 participantes e convites.');
    if (!group.members.includes(target)) {
      const invited = await groups.updateOne({ _id: group._id, $expr: { $lt: [{ $add: [{ $size: '$members' }, { $size: '$invited' }] }, 50] } }, { $addToSet: { invited: target } });
      if (invited.modifiedCount) await notify(db,target,`group-invite:${input.id}:${target}:${Date.now()}`,'Convite para grupo',`@${user.githubLogin} convidou você para “${group.name}”.`,'#community/invitations');
    }
  } else if (input.action === 'group-accept') {
    await groups.updateOne({ _id: id(input.id), type: { $ne: 'help' }, invited: user.githubId }, { $addToSet: { members: user.githubId }, $pull: { invited: user.githubId } });
  } else if (input.action === 'group-leave') {
    const group = await groups.findOne({ _id: id(input.id), members: user.githubId });
    if (group?.owner === user.githubId) throw fail('O criador permanece no grupo nesta versão.');
    await groups.updateOne({ _id: id(input.id) }, { $pull: { members: user.githubId, invited: user.githubId } });
  } else throw fail('Ação inválida.');
  return readSocial(db, user);
}
function validatePost(input) {
  const body = text(input.text || '', 200, true);
  const image = input.image || '';
  if (typeof image !== 'string' || (image && (!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > 400000))) throw fail('Envie uma imagem WebP de até 300 KB.');
  if (!body && !image) throw fail('Escreva algo ou escolha uma foto.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Publicação inválida.');
  return { text: body, image, kind: input.kind === 'help' ? 'help' : 'progress', requestId: input.requestId };
}
async function readFeed(db, user, query = {}) {
  const filter = { deletedAt: { $exists: false } };
  if (query.before) filter._id = { $lt: id(query.before) };
  if (query.post) filter._id = id(query.post);
  const posts = await db.collection('communityPosts').find(filter).sort({ _id: -1 }).limit(21).toArray();
  const page = posts.slice(0, 20); const ids = page.map(p => p._id.toHexString());
  const comments = await db.collection('communityComments').aggregate([{ $match: { postId: { $in: ids }, deletedAt: { $exists: false } } }, { $group: { _id: '$postId', rows: { $topN: { sortBy: { createdAt: -1, _id: -1 }, output: '$$ROOT', n: 10 } }, count: { $sum: 1 } } }]).toArray();
  const likes = await db.collection('communityLikes').aggregate([{ $match: { postId: { $in: ids } } }, { $group: { _id: '$postId', count: { $sum: 1 }, mine: { $max: { $cond: [{ $eq: ['$githubId', user.githubId] }, { $ifNull: ['$reaction', 'heart'] }, ''] } }, reactions: { $push: { $ifNull: ['$reaction', 'heart'] } } } }]).toArray();
  const authors = await people(db, [...new Set(page.map(p => p.githubId).concat(comments.flatMap(c => c.rows.map(r => r.githubId))))]);
  return { posts: page.map(p => { const c = comments.find(c => c._id === p._id.toHexString()); const l = likes.find(l => l._id === p._id.toHexString()); return { id: p._id.toHexString(), text: p.text, image: p.image, kind: p.kind, createdAt: p.createdAt, author: authors.get(p.githubId), own: p.githubId === user.githubId, likes: l?.count || 0, liked: Boolean(l?.mine), reaction: l?.mine || null, reactions: Object.fromEntries(REACTIONS.map(key => [key, (l?.reactions || []).filter(r => r === key).length])), commentCount: c?.count || 0, comments: (c?.rows || []).reverse().map(r => ({ id: String(r._id), text: r.text, author: authors.get(r.githubId), own: r.githubId === user.githubId })) }; }), hasMore: posts.length > 20 };
}
async function feedAction(db, user, input) {
  if (input.action === 'publish') {
    const data = validatePost(input); const key = `${user.githubId}:${data.requestId}`;
    if (!await db.collection('communityPosts').findOne({ requestKey: key })) {
      const lock = await db.collection('users').updateOne({ _id: user._id, $or: [{ socialLastPostAt: { $exists: false } }, { socialLastPostAt: { $lte: new Date(Date.now() - 10000) } }] }, { $set: { socialLastPostAt: new Date() } });
      if (!lock.modifiedCount) throw fail('Aguarde 10 segundos para publicar novamente.', 429);
      // Stable unique key makes retries safe, while ObjectId keeps chronological pagination.
      try { await db.collection('communityPosts').insertOne({ _id: new ObjectId(), requestKey: key, githubId: user.githubId, ...data, createdAt: new Date() }); } catch (e) { if (e.code !== 11000) throw e; }
    }
  } else {
    const postId = id(input.postId).toHexString();
    const post = await db.collection('communityPosts').findOne({ _id: new ObjectId(postId), deletedAt: { $exists: false } });
    if (!post) throw fail('Publicação indisponível.', 404);
    if (input.action === 'like') {
      if (typeof input.liked !== 'boolean' || (input.reaction !== undefined && input.reaction !== null && !REACTIONS.includes(input.reaction))) throw fail('Reação inválida.');
      const key = `${postId}:${user.githubId}`;
      if (input.liked) await db.collection('communityLikes').updateOne({ _id: key }, { $set: { reaction: input.reaction || 'heart' }, $setOnInsert: { postId, githubId: user.githubId } }, { upsert: true });
      else await db.collection('communityLikes').deleteOne({ _id: key });
    } else if (input.action === 'comment') {
      const body = text(input.text, 600);
      if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Comentário inválido.');
      await db.collection('communityComments').updateOne({ _id: `${user.githubId}:${input.requestId}` }, { $setOnInsert: { postId, githubId: user.githubId, text: body, createdAt: new Date() } }, { upsert: true });
    } else if (input.action === 'delete-post' && post.githubId === user.githubId) await db.collection('communityPosts').updateOne({ _id: post._id }, { $set: { deletedAt: new Date() }, $unset: { text: '', image: '' } });
    else if (input.action === 'delete-comment') {
      await db.collection('communityComments').deleteOne({ _id: String(input.id), postId, githubId: user.githubId });
    } else throw fail('Ação não autorizada.', 403);
  }
  return { ok: true };
}
module.exports = { REACTIONS, channelFor, channelFilter, readSocial, socialAction, validatePost, readFeed, feedAction };
