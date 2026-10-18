const { ObjectId } = require('mongodb');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const canAnnounce = user => ['admin', 'moderator'].includes(user.communityRole) || (process.env.COMMUNITY_ADMIN_GITHUB_IDS || '').split(',').map(v => v.trim()).filter(Boolean).includes(user.githubId);
async function notify(db, recipient, key, title, message, path, metadata={}) {
  const actorId=typeof metadata.actorId==='string'?metadata.actorId:null;const groupId=typeof metadata.groupId==='string'&&/^[a-f0-9]{24}$/.test(metadata.groupId)?metadata.groupId:null;
  if(recipient!=='*'){if(actorId&&await db.collection('communityBlocks').findOne({githubId:recipient,blockedId:actorId}))return;if(groupId&&await db.collection('communityGroupMutes').findOne({_id:`${recipient}:${groupId}`}))return;}
  await db.collection('communityNotifications').updateOne({ _id: key }, { $setOnInsert: { recipient, title, message, path,...(actorId?{actorId}:{}),...(groupId?{groupId}:{}), createdAt: new Date() } }, { upsert: true });
}
async function readInbox(db, user) {
  const fresh = await db.collection('users').findOne({ _id: user._id }, { projection: { communityInboxReadAt: 1, communityRole: 1, githubId: 1 } });
  const since = fresh?.communityInboxReadAt || new Date(0);
  const blocks=await db.collection('communityBlocks').find({githubId:user.githubId}).toArray();
  const mutes=await db.collection('communityGroupMutes').find({githubId:user.githubId},{projection:{groupId:1}}).toArray();
  const personal={recipient:user.githubId,actorId:{$nin:blocks.map(r=>r.blockedId)},groupId:{$nin:mutes.map(r=>r.groupId)}};
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const logins=blocks.map(r=>r.login).filter(Boolean);if(logins.length)personal.message={$not:{$regex:`^@(?:${logins.map(escape).join('|')})(?:\\s|$)`,$options:'i'}};
  if(mutes.length)personal.path={$not:{$regex:`^#community/(?:groups|help)/(?:${mutes.map(r=>r.groupId).join('|')})(?:[?]|$)`}};
  const scope={$or:[personal,{recipient:'*'}]};
  const rows = await db.collection('communityNotifications').find(scope).sort({ createdAt: -1, _id: -1 }).limit(50).toArray();
  return { items: rows.map(r => ({ id: String(r._id), title: r.title, message: r.message, path: r.path, createdAt: r.createdAt, unread: r.createdAt > since })), unread: await db.collection('communityNotifications').countDocuments({ ...scope, createdAt: { $gt: since } }), canAnnounce: canAnnounce(fresh || user), checkedAt: new Date() };
}
async function inboxAction(db, user, input) {
  if (input.action === 'read') {
    const until = new Date(input.checkedAt);
    if (!Number.isFinite(until.getTime()) || until > new Date()) throw fail('Data de leitura inválida.');
    await db.collection('users').updateOne({ _id: user._id }, { $max: { communityInboxReadAt: until } });
  } else if (input.action === 'announce') {
    const fresh = await db.collection('users').findOne({ _id: user._id });
    if (!canAnnounce(fresh || user)) throw fail('Apenas administradores e moderadores podem enviar avisos.', 403);
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!title || title.length > 80 || !message || message.length > 1000) throw fail('Use título de até 80 e mensagem de até 1.000 caracteres.');
    await notify(db, '*', new ObjectId().toHexString(), title, message, '#community');
  } else throw fail('Ação inválida.');
  return readInbox(db, user);
}
module.exports = { notify, canAnnounce, readInbox, inboxAction };
