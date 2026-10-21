const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const canAnnounce = user => Boolean(require('./permissions').roleFor(user));
async function notify(db, recipient, key, title, message, path, metadata={}) {
  const actorId=typeof metadata.actorId==='string'?metadata.actorId:null;const groupId=typeof metadata.groupId==='string'&&/^[a-f0-9]{24}$/.test(metadata.groupId)?metadata.groupId:null;
  const category=metadata.category||(key.startsWith('reply:')?'replies':key.startsWith('comment:')?'comments':key.startsWith('project-apply:')||key.startsWith('project-decision:')?'collaboration':key.startsWith('event-review:')?'events':null);
  if(recipient!=='*'&&category){const person=await db.collection('users').findOne({githubId:recipient},{projection:{communityNotificationPreferences:1}});if(person?.communityNotificationPreferences?.[category]===false)return;}
  if(recipient!=='*'){if(actorId&&await db.collection('communityBlocks').findOne({githubId:recipient,blockedId:actorId}))return;if(groupId&&await db.collection('communityGroupMutes').findOne({_id:`${recipient}:${groupId}`}))return;}
  await db.collection('communityNotifications').updateOne({ _id: key }, { $setOnInsert: { recipient, title, message, path,...(actorId?{actorId}:{}),...(groupId?{groupId}:{}), createdAt: new Date() } }, { upsert: true });
}
async function readInbox(db,user,query={}) { return require('./mailbox').readMailbox(db,user,query); }
async function inboxAction(db, user, input) {
  if(['set-read','star','archive'].includes(input.action)){await require('./mailbox').changeMessage(db,user,input);return {ok:true};}
  if (input.action === 'read') {
    const until = new Date(input.checkedAt);
    if (!Number.isFinite(until.getTime()) || until > new Date()) throw fail('Data de leitura inválida.');
    await db.collection('communityInboxState').updateMany({githubId:user.githubId,notificationAt:{$lte:until}},{$set:{unread:false}});
    await db.collection('users').updateOne({ _id: user._id }, { $max: { communityInboxReadAt: until } });
  } else if (input.action === 'announce') {
    const fresh = await require('./permissions').requireStaff(db,user);
    if (!canAnnounce(fresh || user)) throw fail('Apenas administradores e moderadores podem enviar avisos.', 403);
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!title || title.length > 80 || !message || message.length > 1000) throw fail('Use título de até 80 e mensagem de até 1.000 caracteres.');
    await require('./admin').adminAction(db,user,{action:'announce',title,message,reason:input.reason,requestId:input.requestId});
  } else throw fail('Ação inválida.');
  return readInbox(db, user);
}
module.exports = { notify, canAnnounce, readInbox, inboxAction };
