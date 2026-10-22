const test=require('node:test');
const assert=require('node:assert/strict');
const {createWorkerScheduler}=require('./worker-scheduler');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(tasks){const timers=[];const cancelled=[];const scheduler=createWorkerScheduler({...tasks,setInterval(fn,delay){const t={fn,delay};timers.push(t);return t;},clearInterval(t){cancelled.push(t);}});return {scheduler,timers,cancelled};}
test('worker starts a recovery cycle immediately, keeps intervals and avoids overlapping tasks',async()=>{
 let calls=0,dispatch=0,release;const gate=new Promise(r=>release=r);
 const h=harness({sync:async()=>{calls++;await gate;},dispatch:async()=>{dispatch++;}});
 await flush();assert.equal(calls,1);assert.deepEqual(h.timers.map(t=>t.delay),[600000,60000]);
 h.timers[0].fn();h.timers[0].fn();h.timers[1].fn();await flush();assert.equal(calls,1);assert.equal(dispatch,1);
 let finished=false;const stopped=h.scheduler.stop().then(()=>finished=true);await flush();assert.equal(finished,false);
 release();await stopped;assert.equal(h.cancelled.length,2);
 h.timers.forEach(t=>t.fn());await flush();assert.equal(calls,1);assert.equal(dispatch,1);
});
test('failed background work retries on its next interval without unhandled rejection',async()=>{
 let calls=0,errors=0;const h=harness({sync:async()=>{if(++calls===1)throw Error('private detail');},dispatch:async()=>{},onError:()=>errors++});
 await flush();assert.equal(errors,1);h.timers[0].fn();await flush();assert.equal(calls,2);await h.scheduler.stop();
});
