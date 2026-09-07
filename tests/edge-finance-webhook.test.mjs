import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {createFinanceWebhook,normalizeFinanceEvent}=await loadTypescript('../../supabase/functions/_shared/financeWebhook.ts');
const id='60000000-0000-4000-8000-000000000001',secret='whsec_synthetic_signing_secret_never_live_012345';
const config={id,provider:'STRIPE',account:'acct_synthetic',environment:'TEST',currency:'USD',timezone:'America/New_York',enabled:true};
const sample={id:'evt_1',type:'invoice.paid',livemode:false,data:{object:{id:'in_1',currency:'usd',status:'paid',amount_paid:150000,status_transitions:{paid_at:1767373200}}}};
const now=1788782400;
function request(body=JSON.stringify(sample),seconds=now,signingSecret=secret,headerName='stripe-signature'){
 const signature=createHmac('sha256',signingSecret).update(seconds+'.'+body).digest('hex');
 return new Request('https://example.test/finance-webhook?connection='+id,{method:'POST',headers:{'content-type':'application/json',[headerName]:`t=${seconds},v1=${signature}`},body});
}
test('raw-body HMAC verification rejects tampering, expired deliveries and oversized bodies before database access',async()=>{
 let reads=0,writes=0;const handler=createFinanceWebhook({signing:{[id]:{...config,secrets:[secret]}},now:()=>now*1000,connection:async()=>{reads++;return config;},enqueue:async()=>{writes++;return id;}});
 const valid=await handler(request());assert.equal(valid.status,200);assert.equal(reads,1);assert.equal(writes,1);
 for(const req of [request(JSON.stringify(sample),now-301),request(JSON.stringify(sample),now+301),request(JSON.stringify(sample),now,'wrong_secret'),new Request(request(),{body:JSON.stringify({...sample,id:'evt_forged'})})])assert.equal((await handler(req)).status,401);
 const large=' '.repeat(1048577);assert.equal((await handler(request(large))).status,413);assert.equal(reads,1);assert.equal(writes,1);
 const invalid=new Request(request(),{headers:{'content-type':'application/json','stripe-signature':'t='+now+',t='+now+',v1='+'a'.repeat(64)}});assert.equal((await handler(invalid)).status,401);
});
test('key rotation, test/live and account binding, fail-closed persistence and exact Stripe cents are enforced',async()=>{
 const events=[];const deps={signing:{[id]:{...config,secrets:['whsec_retired_synthetic_key_01234567890123456789',secret]}},now:()=>now*1000,connection:async()=>config,enqueue:async(_id,event,hash)=>{events.push(event);assert.match(hash,/^[a-f0-9]{64}$/);return id;}};
 const handler=createFinanceWebhook(deps);assert.equal((await handler(request())).status,200);assert.equal(events[0].source.amount,'1500.00');
 for(const event of [{...sample,livemode:true},{...sample,account:'acct_other'},{...sample,data:{object:{...sample.data.object,amount_paid:0.1}}},{...sample,data:{object:{...sample.data.object,paid_out_of_band:true}}}])assert.equal((await handler(request(JSON.stringify(event)))).status,422);
 assert.equal((await createFinanceWebhook({...deps,connection:async()=>({...config,enabled:false})})(request())).status,503);
 assert.equal((await createFinanceWebhook({...deps,enqueue:async()=>{throw new Error('transient database failure');}})(request())).status,503);
 const unknown=normalizeFinanceEvent({...sample,type:'customer.updated'},config);assert.deepEqual(unknown.source,{type:'customer.updated'});assert.equal(unknown.operation,'UNSUPPORTED');
 assert.equal(events.length,1);
});
test('generic signed usage and payroll journals retain exact units and require explicit source dates and account codes',async()=>{
 const generic={...config,provider:'GENERIC'},events=[];
 const handler=createFinanceWebhook({signing:{[id]:{...generic,secrets:[secret]}},now:()=>now*1000,connection:async()=>generic,enqueue:async(_,event)=>{events.push(event);return id;}});
 const usage={version:1,id:'meter_1',object_id:'usage_1',type:'usage.recorded',account:config.account,environment:'TEST',data:{units:'600000.000001',occurred_at:'2026-01-31T23:00:00-05:00'}};
 assert.equal((await handler(request(JSON.stringify(usage),now,secret,'x-finance-signature'))).status,200);assert.equal(events[0].source.units,'600000.000001');
 for(const data of [{units:600000,occurred_at:usage.data.occurred_at},{...usage.data,occurred_at:'2026-01-31T23:00:00'},{...usage.data,units:'NaN'}])assert.equal((await handler(request(JSON.stringify({...usage,data}),now,secret,'x-finance-signature'))).status,422);
 const payroll={...usage,type:'journal.posted',data:{currency:'USD',date:'2026-01-31',lines:[{account_code:'6100',debit:'12345.67',credit:'0.00'},{account_code:'2100',debit:'0.00',credit:'12345.67'}]}};
 assert.equal((await handler(request(JSON.stringify(payroll),now,secret,'x-finance-signature'))).status,200);assert.equal(events[1].source.lines[0].debit,'12345.67');
 assert.throws(()=>normalizeFinanceEvent({...payroll,data:{...payroll.data,date:'2026-02-30'}},generic),/invalid date/);
});
