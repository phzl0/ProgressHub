const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOG, appearanceFor, validateAppearance } = require('./cosmetics');
test('initial collection has five frames, three themed covers and only allowlisted appearance fields', () => {
  assert.equal(CATALOG.frames.length, 8); assert.equal(CATALOG.covers.filter(c => c.id !== 'custom').length, 6);
  assert.deepEqual(validateAppearance({ frame: 'prestige', cover: 'orbit', title: 'building', xp: 40000 }), { frame: 'prestige', cover: 'orbit', title: 'building' });
  assert.deepEqual(appearanceFor({}), { frame: 'essential', cover: 'custom', title: 'none' });
  assert.throws(() => validateAppearance({ frame: 'url(https://example.com)', cover: 'custom', title: 'none' }), { status: 400 });
});

const {validateOwnedAppearance, inventoryFor, claimWelcome}=require('./cosmetics');
const now=new Date('2026-10-20T12:00:00Z');
const granted={_id:'owner',communityCosmetics:{welcomeClaimedAt:now,welcomeExpiresAt:new Date(now.getTime()+7*86400000)}};
const energy={frame:'energy',cover:'energy',title:'energy',card:'energy',chat:'energy',avatar:'bolt'};
test('temporary choices require ownership and server controls expiry, including public DTOs',()=>{
 assert.throws(()=>validateOwnedAppearance({...energy,expiresAt:{frame:'2099-01-01'}},{},now),{status:403});
 const saved=validateOwnedAppearance({...energy,xp:500,rank:1,expiresAt:{frame:'2099-01-01'}},granted,now);
 assert.equal(saved.expiresAt.frame,'2026-10-27T12:00:00.000Z');assert.equal(saved.rank,undefined);assert.equal(saved.xp,undefined);
 assert.equal(appearanceFor({communityAppearance:saved},now).chat,'energy');
 const expired=appearanceFor({communityAppearance:saved},new Date('2026-10-27T12:00:00Z'));
 assert.deepEqual(expired,{frame:'essential',cover:'custom',title:'none',avatar:'bolt'});
 assert.throws(()=>validateOwnedAppearance(energy,granted,new Date('2026-10-27T12:00:00Z')),{status:403});
 assert.equal(inventoryFor(granted,now).catalog.cards.find(i=>i.id==='energy').owned,true);
});
test('welcome claim is atomic and retries do not extend the seven-day lifetime',async()=>{
 const user={_id:'owner'};const collection={async updateOne(query,update){assert.equal(query['communityCosmetics.welcomeClaimedAt'].$exists,false);if(!user.communityCosmetics)Object.assign(user,update.$set);},async findOne(){return user;}};
 const db={collection(name){assert.equal(name,'users');return collection;}};
 await Promise.all([claimWelcome(db,user,now),claimWelcome(db,user,now)]);
 const expiry=user.communityCosmetics.welcomeExpiresAt.toISOString();
 await claimWelcome(db,user,new Date(now.getTime()+86400000));
 assert.equal(user.communityCosmetics.welcomeExpiresAt.toISOString(),expiry);
 assert.equal(user.communityStats,undefined);
});
