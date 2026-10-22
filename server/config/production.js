const {sessionSecret}=require('../middleware/runtime-safety');
function workerMode(env=process.env){const mode=env.COMMUNITY_WORKER_MODE||'separate';if(!['separate','embedded'].includes(mode))throw new Error('COMMUNITY_WORKER_MODE must be separate or embedded.');return mode;}
function origin(value,label,{production=false}={}){
 let url;try{url=new URL(value)}catch(_){throw new Error(`Configure ${label} as an origin.`)}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(production&&url.protocol!=='https:'))throw new Error(`Configure ${label} with ${production?'HTTPS and ':''}no path, credentials or query.`);
 return url.origin;
}
function databaseName(env=process.env){const value=env.MONGODB_DB||'usersDB';if(!/^[a-zA-Z0-9_-]{1,63}$/.test(value))throw new Error('Configure a valid MONGODB_DB.');return value;}
function proxySetting(env){const value=env.TRUST_PROXY;if(value===undefined||value===''){if(env.NODE_ENV==='production')throw new Error('Configure TRUST_PROXY for the actual reverse proxy path.');return 1;}if(!/^[0-5]$/.test(value))throw new Error('TRUST_PROXY must be a known hop count from 0 to 5.');return Number(value);}
function validateWorker(env=process.env){if(!env.MONGODB_URI||!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))throw new Error('Configure MONGODB_URI.');databaseName(env);if(!/^[a-f0-9]{64}$/i.test(env.GITHUB_TOKEN_KEY||''))throw new Error('Configure GITHUB_TOKEN_KEY with 64 hexadecimal characters.');}
function serverSettings(env=process.env){const production=env.NODE_ENV==='production';const secret=sessionSecret(env);const client=origin(env.CLIENT||'http://localhost:3000','CLIENT',{production});const dbName=databaseName(env);if(!env.MONGODB_URI||!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))throw new Error('Configure MONGODB_URI.');
 if(production){validateWorker(env);if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||/^test[_-]/i.test(env.GITHUB_CLIENT_ID)||/^test[_-]/i.test(env.GITHUB_CLIENT_SECRET))throw new Error('Configure real GitHub OAuth credentials.');const callback=new URL(env.GITHUB_CALLBACK_URL||`${client}/api/community/auth/callback`);if(callback.href!==`${client}/api/community/auth/callback`)throw new Error('GITHUB_CALLBACK_URL must use CLIENT and /api/community/auth/callback.');if(!(env.COMMUNITY_ADMIN_GITHUB_IDS||'').split(',').every(s=>/^\d{1,20}$/.test(s.trim())))throw new Error('Configure at least one COMMUNITY_ADMIN_GITHUB_IDS.');}
 return {production,client,secret,dbName,workerMode:workerMode(env),trustProxy:proxySetting(env),cookie:{path:'/',secure:production,httpOnly:true,sameSite:'lax',maxAge:86400000}};
}
function communityRateKey(req){return req.user?.githubId?`github:${req.user.githubId}`:req.ip;}
module.exports={workerMode,origin,databaseName,proxySetting,validateWorker,serverSettings,communityRateKey};
