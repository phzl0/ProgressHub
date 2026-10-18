const { ObjectId } = require('mongodb');
const { channelFor } = require('./social');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const MAX_BYTES = 10 * 1024 * 1024;
function validateFile(name, data) {
  if (typeof name !== 'string' || !name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name) || !Buffer.isBuffer(data) || !data.length || data.length > MAX_BYTES) throw fail('Envie um arquivo de até 10 MB, com nome válido.');
  const ext = name.split('.').at(-1).toLowerCase(); let type = null;
  if (ext === 'png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = 'image/png';
  if (['jpg','jpeg'].includes(ext) && data[0] === 255 && data[1] === 216 && data[2] === 255) type = 'image/jpeg';
  if (ext === 'webp' && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP') type = 'image/webp';
  if (ext === 'pdf' && data.toString('ascii',0,5) === '%PDF-') type = 'application/pdf';
  if (ext === 'zip' && data[0] === 80 && data[1] === 75 && [[3,4],[5,6],[7,8]].some(([a,b]) => data[2] === a && data[3] === b)) type = 'application/zip';
  if (ext === 'txt' && !data.includes(0)) { try { new TextDecoder('utf-8', { fatal: true }).decode(data); type = 'text/plain'; } catch (_) { /* invalid UTF-8 */ } }
  if (!type) throw fail('Formatos aceitos: JPG, PNG, WebP, PDF, TXT e ZIP. O conteúdo deve corresponder ao formato.');
  return { name, type, size: data.length };
}
async function uploadFile(db, user, query, data) {
  const channel = await channelFor(db,user,query.channel);
  if (!channel.startsWith('group:')) throw fail('Anexos estão disponíveis nas conversas de grupo.');
  const file = validateFile(query.name,data);
  if (query.requestId !== undefined && (typeof query.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(query.requestId))) throw fail('Envio inválido.');
  const requestKey = `${user.githubId}:${query.requestId || new ObjectId().toHexString()}`;
  const previous = await db.collection('communityAttachments').findOne({ requestKey, channel }, { projection: { data: 0 } });
  if (previous) return { id: previous._id.toHexString(), name: previous.name, type: previous.type, size: previous.size };
  // Bound staged uploads independently of the IP limiter; unclaimed uploads expire after a day.
  if (await db.collection('communityAttachments').countDocuments({ githubId: user.githubId, expiresAt: { $exists: true } }) >= 10) throw fail('Envie ou remova os anexos pendentes antes de adicionar outros.',429);
  const row = { _id: new ObjectId(), ...file, requestKey, channel, githubId: user.githubId, data, createdAt: new Date(), expiresAt: new Date(Date.now()+86400000) };
  try { await db.collection('communityAttachments').insertOne(row); } catch(error) { if (error.code !== 11000) throw error; const previous = await db.collection('communityAttachments').findOne({requestKey,channel},{projection:{data:0}}); if (!previous) throw fail('Envio indisponível.',409); return {id:previous._id.toHexString(),name:previous.name,type:previous.type,size:previous.size}; }
  return { id: row._id.toHexString(), ...file };
}
async function readFile(db, user, value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw fail('Anexo indisponível.',404);
  const row = await db.collection('communityAttachments').findOne({ _id: new ObjectId(value) });
  if (!row) throw fail('Anexo indisponível.',404);
  await channelFor(db,user,row.channel);
  await require('./safety').requireVisible(db,user,row.githubId);
  if (!row.messageId || !await db.collection('communityMessages').findOne({ _id: new ObjectId(row.messageId), deletedAt: { $exists: false }, 'attachment.id': value })) throw fail('Anexo indisponível.',404);
  return row;
}
module.exports = { MAX_BYTES, validateFile, uploadFile, readFile };
