const { ObjectId } = require('mongodb');
const {blockedIds,requireVisible,requireUnblockedPair}=require('./safety');
const { notify } = require('./notifications');
const { boundedText } = require('./text-limits');
const CATEGORIES = ['feed','project','learning','help','achievement','discussion'];
const REACTIONS = ['heart', 'like', 'laugh', 'sad'];
const { appearanceFor } = require('./cosmetics');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = value => { if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw fail('Item indisponível.', 404); return new ObjectId(value); };
const text = (value,max,optional=false,lines=1) => boundedText(value,max,lines,optional);
const person = user => ({ githubId: user.githubId, login: user.githubLogin, picture: user.picture || '', profileId: user.communityOptIn ? user.githubId : null, appearance: appearanceFor(user) });
const pairKey = (a, b) => [a, b].sort().join(':');
async function people(db, ids) { return new Map((await db.collection('users').find({ githubId: { $in: ids } }, { projection: { githubId: 1, githubLogin: 1, picture: 1, communityOptIn: 1, communityAppearance: 1 } }).toArray()).map(u => [u.githubId, person(u)])); }
async function channelFor(db, user, value = 'general') {
  if (['general', 'help'].includes(value)) return value;
  if (typeof value !== 'string' || !value.startsWith('group:')) throw fail('Conversa indisponível.', 404);
  if (!await db.collection('communityGroups').findOne({ _id: id(value.slice(6)), moderationHidden: {$ne:true}, members: user.githubId })) throw fail('Você não participa deste grupo.', 403);
  return value;
}
function channelFilter(channel) { return channel === 'general' ? { $or: [{ channel: 'general' }, { channel: { $exists: false } }] } : { channel }; }
async function readSocial(db, user) {
  const hidden=await blockedIds(db,user);const reciprocal=(await db.collection('communityBlocks').find({blockedId:user.githubId},{projection:{githubId:1}}).toArray()).map(r=>r.githubId);const excluded=[...new Set([...hidden,...reciprocal])];
  const muted=(await db.collection('communityGroupMutes').find({githubId:user.githubId},{projection:{groupId:1}}).toArray()).map(r=>r.groupId);
  const contacts = await db.collection('communityContacts').find({ $or: [{ from: user.githubId }, { to: user.githubId }] }).limit(100).toArray();
  const groups = await db.collection('communityGroups').find({ moderationHidden:{$ne:true}, $or: [{ members: user.githubId }, { invited: user.githubId }] }).limit(50).toArray();
  const authors = await people(db, [...new Set(contacts.flatMap(c => [c.from, c.to]).concat(groups.flatMap(g => [g.owner, ...g.members, ...g.invited])))]);
  return { contacts: contacts.filter(c=>!excluded.includes(c.from===user.githubId?c.to:c.from)).map(c => ({ id: String(c._id), status: c.status, incoming: c.to === user.githubId, person: authors.get(c.from === user.githubId ? c.to : c.from) })), groups: groups.filter(g=>g.members.includes(user.githubId)||!excluded.includes(g.owner)).map(g => ({ id: g._id.toHexString(), name: g.name, description: g.description, cover: g.cover || '', muted: muted.includes(g._id.toHexString()), helpStatus: g.helpStatus || null, type: g.type || 'group', owner: g.owner === user.githubId, joined: g.members.includes(user.githubId), members: g.members.map(m => authors.get(m)).filter(Boolean) })) };
}
async function socialAction(db, user, input) {
  const contacts = db.collection('communityContacts'); const groups = db.collection('communityGroups');
  if (input.action === 'contact-request') {
    const login = text(input.login, 39).replace(/^@/, '');
    if (!/^[a-zA-Z0-9-]+$/.test(login)) throw fail('Informe o nome de usuário do GitHub.');
    const target = await db.collection('users').findOne({ githubLogin: { $regex: `^${login}$`, $options: 'i' }, githubId: { $exists: true } });
    if (!target || target.githubId === user.githubId) throw fail('Escolha outro usuário que já entrou no Progress Hub.');
    await requireUnblockedPair(db,user.githubId,target.githubId);
    const key = pairKey(user.githubId, target.githubId);
    const invitation = await contacts.updateOne({ _id: key }, { $setOnInsert: { from: user.githubId, to: target.githubId, status: 'pending', createdAt: new Date() } }, { upsert: true });
    if (invitation.upsertedCount) await notify(db, target.githubId, `contact:${key}:${Date.now()}`, 'Convite de contato', `@${user.githubLogin} quer adicionar você.`, '#community/invitations',{actorId:user.githubId});
  } else if (input.action === 'contact-accept') {
    const invitation = await contacts.findOne({ _id: String(input.id), to: user.githubId, status: 'pending' });
    if(invitation)await requireUnblockedPair(db,user.githubId,invitation.from);
    const accepted = await contacts.updateOne({ _id: String(input.id), to: user.githubId, status: 'pending' }, { $set: { status: 'accepted' } });
    if (invitation && accepted.modifiedCount) await notify(db, invitation.from, `contact-accepted:${input.id}:${Date.now()}`, 'Contato adicionado', `@${user.githubLogin} aceitou seu convite.`, '#community/contacts',{actorId:user.githubId});
  } else if (input.action === 'contact-remove') {
    await contacts.deleteOne({ _id: String(input.id), $or: [{ from: user.githubId }, { to: user.githubId }] });
  } else if (input.action === 'group-create') {
    if(input.requestId!==undefined&&(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)))throw fail('Tentativa de criação inválida.');
    const requestKey=input.requestId?`group:${user.githubId}:${input.requestId}`:null;
    if(requestKey&&await groups.findOne({requestKey,owner:user.githubId}))return readSocial(db,user);
    if(await groups.countDocuments({owner:user.githubId})>=10)throw fail('Limite de 10 grupos por criador.');
    const row={name:text(input.name,60),description:text(input.description||'',240,true,8),owner:user.githubId,members:[user.githubId],invited:[],createdAt:new Date()};
    if(requestKey){try{await groups.updateOne({requestKey},{$setOnInsert:row},{upsert:true});}catch(e){if(e.code!==11000)throw e;}}
    else await groups.insertOne(row);
  } else if (input.action === 'group-update') {
    if (!await groups.findOne({_id:id(input.id),owner:user.githubId})) throw fail('Apenas o dono pode editar o grupo.',403);
    const cover=input.cover||'';
    if(typeof cover!=='string'||(cover&&(!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(cover)||cover.length>400000)))throw fail('Envie uma capa WebP de até 300 KB.');
    await groups.updateOne({_id:id(input.id),owner:user.githubId},{$set:{cover,description:text(input.description||'',2000,true,8)}});
  } else if (input.action === 'group-invite') {
    const group = await groups.findOne({ _id: id(input.id), owner: user.githubId });
    if (!group) throw fail('Apenas o criador pode convidar.', 403);
    if (group.type === 'help') throw fail('Entre no grupo pela página do pedido de ajuda.');
    const target = String(input.githubId);
    await requireUnblockedPair(db,user.githubId,target);
    if (!await contacts.findOne({ _id: pairKey(user.githubId, target), status: 'accepted' })) throw fail('Adicione e confirme o contato antes de convidar.');
    if (group.members.length + group.invited.length >= 50) throw fail('Este grupo atingiu 50 participantes e convites.');
    if (!group.members.includes(target)) {
      const invited = await groups.updateOne({ _id: group._id, $expr: { $lt: [{ $add: [{ $size: '$members' }, { $size: '$invited' }] }, 50] } }, { $addToSet: { invited: target } });
      if (invited.modifiedCount) await notify(db,target,`group-invite:${input.id}:${target}:${Date.now()}`,'Convite para grupo',`@${user.githubLogin} convidou você para “${group.name}”.`,'#community/invitations',{actorId:user.githubId,groupId:input.id});
    }
  } else if (input.action === 'group-accept') {
    const invitation=await groups.findOne({_id:id(input.id),invited:user.githubId});if(invitation)await requireUnblockedPair(db,user.githubId,invitation.owner);
    await groups.updateOne({ _id: id(input.id), type: { $ne: 'help' }, invited: user.githubId }, { $addToSet: { members: user.githubId }, $pull: { invited: user.githubId } });
  } else if (input.action === 'group-leave') {
    const group = await groups.findOne({ _id: id(input.id), members: user.githubId });
    if (group?.owner === user.githubId) throw fail('O criador permanece no grupo nesta versão.');
    await groups.updateOne({ _id: id(input.id) }, { $pull: { members: user.githubId, invited: user.githubId } });
    await db.collection('communityGroupMutes').deleteOne({_id:`${user.githubId}:${input.id}`});
  } else throw fail('Ação inválida.');
  return readSocial(db, user);
}
function validatePost(input) {
  const body = text(input.text || '', 200, true, 3);
  const image = input.image || '';
  if (typeof image !== 'string' || (image && (!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > 400000))) throw fail('Envie uma imagem WebP de até 300 KB.');
  if (!body && !image) throw fail('Escreva algo ou escolha uma foto.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw fail('Publicação inválida.');
  return { text: body, image, kind: CATEGORIES.includes(input.kind) ? input.kind : 'feed', requestId: input.requestId };
}
async function readFeed(db, user, query = {}) {
  const hidden=await blockedIds(db,user);
  const filter = { deletedAt: { $exists: false }, moderationHidden: { $ne: true }, githubId: {$nin:hidden} };
  if(query.kind && query.kind!=='all') {if(!CATEGORIES.includes(query.kind))throw fail('Categoria inválida.');filter.kind=query.kind==='project'?{$in:['project','progress']}:query.kind;}
  if (query.before) filter._id = { $lt: id(query.before) };
  if (query.post) filter._id = id(query.post);
  const posts = await db.collection('communityPosts').find(filter).sort({ _id: -1 }).limit(21).toArray();
  const page = posts.slice(0, 20); const ids = page.map(p => p._id.toHexString());
  const comments = await db.collection('communityComments').aggregate([{ $match: { postId: { $in: ids }, githubId: {$nin:hidden}, deletedAt: { $exists: false }, moderationHidden: { $ne: true } } }, { $group: { _id: '$postId', rows: { $topN: { sortBy: { createdAt: -1, _id: -1 }, output: '$$ROOT', n: 10 } }, count: { $sum: 1 } } }]).toArray();
  const likes = await db.collection('communityLikes').aggregate([{ $match: { postId: { $in: ids } } }, { $group: { _id: '$postId', count: { $sum: 1 }, mine: { $max: { $cond: [{ $eq: ['$githubId', user.githubId] }, { $ifNull: ['$reaction', 'heart'] }, ''] } }, reactions: { $push: { $ifNull: ['$reaction', 'heart'] } } } }]).toArray();
  const authors = await people(db, [...new Set(page.map(p => p.githubId).concat(comments.flatMap(c => c.rows.map(r => r.githubId))))]);
  return { posts: page.map(p => { const c = comments.find(c => c._id === p._id.toHexString()); const l = likes.find(l => l._id === p._id.toHexString()); return { id: p._id.toHexString(), text: p.text, image: p.image, kind: p.kind==='progress'?'project':p.kind||'feed', createdAt: p.createdAt, author: authors.get(p.githubId), own: p.githubId === user.githubId, likes: l?.count || 0, liked: Boolean(l?.mine), reaction: l?.mine || null, reactions: Object.fromEntries(REACTIONS.map(key => [key, (l?.reactions || []).filter(r => r === key).length])), commentCount: c?.count || 0, comments: (c?.rows || []).reverse().map(r => ({ id: String(r._id), text: r.text, author: authors.get(r.githubId), own: r.githubId === user.githubId })) }; }), hasMore: posts.length > 20 };
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
    if(input.action==='delete-post'&&await db.collection('communityPosts').findOne({_id:new ObjectId(postId),githubId:user.githubId,deletedAt:{$exists:true}}))return {ok:true};
    const post = await db.collection('communityPosts').findOne({ _id: new ObjectId(postId), deletedAt: { $exists: false }, moderationHidden: { $ne: true } });
    if (!post) throw fail('Publicação indisponível.', 404);
    await requireVisible(db,user,post.githubId);
    if (input.action === 'like') {
      if (typeof input.liked !== 'boolean' || (input.reaction !== undefined && input.reaction !== null && !REACTIONS.includes(input.reaction))) throw fail('Reação inválida.');
      const key = `${postId}:${user.githubId}`;
      if (input.liked) await db.collection('communityLikes').updateOne({ _id: key }, { $set: { reaction: input.reaction || 'heart' }, $setOnInsert: { postId, githubId: user.githubId } }, { upsert: true });
      else await db.collection('communityLikes').deleteOne({ _id: key });
    } else if (input.action === 'comment') {
      await require('./comments').addComment(db,user,'post',postId,input);
    } else if (input.action === 'delete-post' && post.githubId === user.githubId) await db.collection('communityPosts').updateOne({ _id: post._id }, { $set: { deletedAt: new Date() }, $unset: { text: '', image: '' } });
    else if (input.action === 'delete-comment') {
      await require('./comments').deleteComment(db,user,'post',postId,input.id);
    } else throw fail('Ação não autorizada.', 403);
  }
  return { ok: true };
}
module.exports = { CATEGORIES, REACTIONS, channelFor, channelFilter, readSocial, socialAction, validatePost, readFeed, feedAction };
