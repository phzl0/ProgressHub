const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const library=require('./cosmetic-library.json');
const root=path.resolve(__dirname,'../../..');
const publicRoot=path.join(root,'client/public');
test('library has 30 unique asset choices in each category and server/client manifests agree',()=>{
 assert.deepEqual(library,JSON.parse(fs.readFileSync(path.join(root,'client/src/components/Community/cosmeticLibrary.json'),'utf8')));
 const provenance=JSON.parse(fs.readFileSync(path.join(publicRoot,'cosmetics/provenance.json'),'utf8'));
 for(const [category,items] of Object.entries(library)){
  assert.equal(items.length,30,category);assert.equal(new Set(items.map(item=>item.id)).size,30);
  const hashes=new Set();
  for(const item of items){
   assert.match(item.asset,/^\/cosmetics\/(frames|panels)\/[a-zA-Z0-9_-]+\.(svg|png)$/);
   const bytes=fs.readFileSync(path.join(publicRoot,item.asset));const hash=crypto.createHash('sha256').update(bytes).digest('hex');hashes.add(hash);
   assert.ok(provenance.some(row=>'/cosmetics/'+row.file===item.asset&&row.sha256===hash));
   if(item.asset.endsWith('.svg')){const svg=bytes.toString();assert.doesNotMatch(svg,/<(?:script|foreignObject|image)\b|\bon\w+=|https?:\/\/(?!www\.w3\.org\/)/i);assert.match(svg,/viewBox=/);}
  }
  assert.equal(hashes.size,30,`${category}: no repeated resolution or identical files`);
 }
 for(const name of ['portrait','fantasy','adventure','scifi'])assert.match(fs.readFileSync(path.join(publicRoot,`cosmetics/licenses/${name}.txt`),'utf8'),/CC0|Creative Commons Zero/);
});
