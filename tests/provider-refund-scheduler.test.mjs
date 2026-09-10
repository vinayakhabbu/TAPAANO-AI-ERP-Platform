import assert from 'node:assert/strict';
import test from 'node:test';
import {runProviderRefundScheduler} from '../scripts/run-provider-refund-worker.mjs';
const config={url:'https://synthetic.supabase.co/functions/v1/provider-refund-worker',token:'synthetic_scheduler_token_1234567890'};
test('provider scheduler bounds dispatch batches, stops when idle and uses the dedicated worker token',async()=>{
 const calls=[];const r=await runProviderRefundScheduler(config,async(url,init)=>{calls.push({url,init});assert.equal(init.headers.Authorization,'Bearer '+config.token);assert.equal(init.redirect,'error');return new Response(JSON.stringify({state:calls.length===2?'idle':'verified'}));});assert.deepEqual(r,['verified','idle']);assert.equal(calls.length,2);
 for(const url of ['http://synthetic.supabase.co/functions/v1/provider-refund-worker','https://attacker.example/functions/v1/provider-refund-worker',config.url+'?token=x'])await assert.rejects(runProviderRefundScheduler({...config,url},()=>{throw Error('must not fetch');}),/configuration/);
});
test('provider scheduler errors expose only typed operational codes',async()=>{
 await assert.rejects(runProviderRefundScheduler(config,async()=>new Response(JSON.stringify({code:'DISPATCH_UNCERTAIN',secret:'provider-secret'}),{status:503})),e=>e.message.includes('DISPATCH_UNCERTAIN')&&!e.message.includes('provider-secret'));
});
