const fail=(message,status=403)=>Object.assign(new Error(message),{status});
const configured=(name,id)=>Boolean(id&&(process.env[name]||'').split(',').map(v=>v.trim()).includes(id));
function roleFor(user={}){if(configured('COMMUNITY_ADMIN_GITHUB_IDS',user.githubId))return 'admin';if(user.communityRole==='admin')return 'admin';if(user.communityRole==='moderator'||configured('COMMUNITY_MODERATOR_GITHUB_IDS',user.githubId))return 'moderator';return null;}
function suspensionFor(user,now=new Date()){const s=user?.communitySuspension;return s?.until&&new Date(s.until)>now?{until:s.until,reason:s.reason}:null;}
async function freshUser(db,user){return user?.githubId?db.collection('users').findOne({githubId:user.githubId}):null;}
async function assertCanWrite(db,user){const fresh=await freshUser(db,user);if(!fresh)throw fail('Sessão indisponível.',401);const suspension=suspensionFor(fresh);if(suspension)throw fail(`Sua participação está suspensa até ${new Date(suspension.until).toISOString()}. Motivo: ${suspension.reason}`);return fresh;}
async function requireStaff(db,user){const fresh=await assertCanWrite(db,user);const role=roleFor(fresh);if(!role)throw fail('Acesso exclusivo à administração.');return {...fresh,staffRole:role};}
module.exports={roleFor,suspensionFor,freshUser,assertCanWrite,requireStaff};
