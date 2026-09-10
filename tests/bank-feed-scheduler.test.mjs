import assert from 'node:assert/strict';
import test from 'node:test';
import {runBankFeedScheduler} from '../scripts/run-bank-feed-worker.mjs';
const config={url:'https://synthetic-project.supabase.co/functions/v1/bank-feed-worker',token:'synthetic_scheduler_secret_0123456789'};
test('bank scheduler uses the fixed worker path and stops on idle without exposing credentials',async()=>{
 const calls=[];const states=['continuation_queued','synchronized','idle'];const result=await runBankFeedScheduler(config,async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({state:states.shift()}));});
 assert.deepEqual(result,['continuation_queued','synchronized','idle']);assert.equal(calls.length,3);assert.equal(calls[0].init.body,'{}');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers.Authorization,'Bearer '+config.token);
 for(const url of ['http://127.0.0.1/functions/v1/bank-feed-worker','https://attacker.example/functions/v1/bank-feed-worker',config.url+'?token=secret','https://synthetic-project.supabase.co/functions/v1/other'])await assert.rejects(runBankFeedScheduler({...config,url},async()=>assert.fail('Invalid endpoint must not run')),/configuration/);
});
test('bank scheduler reports sanitized failures and treats unknown success bodies as failures',async()=>{
 await assert.rejects(runBankFeedScheduler(config,async()=>new Response(JSON.stringify({code:'AUTH_REQUIRED',message:config.token}),{status:503})),error=>error.message==='Bank feed worker requires attention: AUTH_REQUIRED');
 await assert.rejects(runBankFeedScheduler(config,async()=>{throw new Error(config.token);}),error=>!error.message.includes(config.token));
 await assert.rejects(runBankFeedScheduler(config,async()=>new Response('{"state":"pretend-success"}')),/unrecognized/);
});
