import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {stripeRefundFixture} from './helpers/stripe-refund-fixture.mjs';
const {createProviderRefundWorker}=await loadTypescript('../../supabase/functions/_shared/providerRefundWorker.ts');
const today=new Date().toISOString().slice(0,10),liability='30000000-0000-4000-8000-000000000085',clearing='30000000-0000-4000-8000-000000000086';let sequence=0;
async function approve(db,kind,payload){await actor(db,ids.adminA);const req=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic refund evidence','provider-refund-'+(++sequence));await actor(db,reviewer);const result=await call(db,'decide_finance_action',req,'APPROVE','Independent refund evidence review');await actor(db,ids.adminA);return {req,...result};}
async function service(db,fn,...args){await db.exec('RESET ROLE;SET ROLE service_role');try{return await call(db,fn,...args);}finally{await db.exec('RESET ROLE;SET ROLE authenticated');}}
const report=db=>call(db,'get_provider_refund_report',ids.entityA,null,100);
async function ready(db,id){await db.exec("RESET ROLE;SELECT set_config('tapaano.accounting_write','trusted',false)");await db.query("UPDATE public.finance_provider_refunds SET next_attempt_at=now()-INTERVAL '1 second' WHERE id=$1",[id]);await db.exec('SET ROLE authenticated');}
async function database(){
 const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${liability}','${ids.orgA}','2395','Customer credit reserve','liability',true),('${clearing}','${ids.orgA}','1186','Stripe clearing','asset',true);SET ROLE authenticated`);
 await approve(db,'CUSTOMER_CREDIT_POLICY',{liability_account_id:liability});await call(db,'create_cash_register',ids.entityA,ids.cashA,'Operating bank');
 const connection=randomUUID();await approve(db,'INTEGRATION_CONFIG',{id:connection,label:'Stripe acceptance',provider:'STRIPE',provider_account:'acct_acceptance',environment:'TEST',timezone:'UTC',clearing_account_id:clearing,enabled:true,expected_version:0});
 const invoice=await call(db,'post_customer_invoice',ids.entityA,ids.customerA,'PROVIDER-INVOICE','2026-01-01','2026-01-01','USD',0,'Synthetic invoice',[{description:'Service',quantity:'1',unit_price:'100.00'}],'provider-invoice');
 const event=await service(db,'enqueue_finance_event',connection,'evt_acceptance','RECEIPT','in_acceptance',{currency:'USD',date:'2026-01-02',amount:'100.00'},'a'.repeat(64));
 const received=await approve(db,'INTEGRATION_APPLY',{event_id:event,target_id:invoice});const line=(await call(db,'get_customer_adjustments',ids.entityA,today)).invoices[0].lines[0].id;
 const credit=(await approve(db,'CUSTOMER_CREDIT',{invoice_id:invoice,reference:'PROVIDER-CREDIT',date:'2026-01-03',lines:[{line_id:line,amount:'60.00'}]})).creditId;
 const id=randomUUID(),payload={id,credit_id:credit,event_id:event,amount:'20.00',reference:'STRIPE-REFUND',date:today};const approved=await approve(db,'PROVIDER_REFUND',payload);
 const fixture=stripeRefundFixture(),token='synthetic_provider_refund_token_'+randomUUID();const worker=createProviderRefundWorker({token,secrets:{[connection]:{environment:'TEST',accountId:'acct_acceptance',secretKey:'sk_test_syntheticcredential'}},fetch:fixture.fetch,rpc:(name,args)=>service(db,name,...Object.values(args))});
 const invoke=()=>worker(new Request('https://erp.example/functions/v1/provider-refund-worker',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({jobId:id})}));
 return {db,id,invoice,credit,event,receipt:received.receiptId,connection,payload,approved,fixture,invoke};
}
test('approved provider refunds reserve credit without creating a journal, and cancellation requires independent review',async()=>{
 const {db,id,credit,receipt,approved}=await database();try{
  let c=(await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0];assert.equal(c.remaining,'60.00');assert.equal(c.providerReserved,'20.00');assert.equal(c.availableToUse,'40.00');assert.equal((await report(db)).refunds[0].useId,null);
  await assert.rejects(approve(db,'CUSTOMER_REFUND',{credit_id:credit,date:today,amount:'40.01',reference:'RESERVED',cash_account_id:ids.cashA,settlement_id:receipt,settlement_kind:'RECEIPT'}),/reserved/);
  await assert.rejects(approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:credit,date:today}),/reserved/);
  assert.equal((await call(db,'get_finance_close_check',ids.entityA,'2026-01-01',today)).providerRefundExceptions,1);
  const request=await call(db,'request_finance_action',ids.entityA,'PROVIDER_REFUND_CANCEL',{job_id:id},'Cancel before sending','cancel-provider');await assert.rejects(call(db,'decide_finance_action',request,'APPROVE','Self approval'),/independent/);
  await actor(db,reviewer);await call(db,'decide_finance_action',request,'APPROVE','Independent cancellation');await actor(db,ids.adminA);
  assert.equal((await report(db)).refunds[0].canceled,true);assert.equal((await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0].providerReserved,'0.00');assert.equal(await service(db,'claim_provider_refund',id),null);
  await actor(db,reviewer);assert.deepEqual(await call(db,'decide_finance_action',approved.req,'APPROVE','Independent refund evidence review'),{refundJobId:id});
 }finally{await db.close();}
});
test('a lost Stripe POST response recovers the existing refund, posts once to clearing and corrects verified returned funds',async()=>{
 const {db,id,fixture,invoke}=await database();try{
  fixture.state.losePost=true;let response=await invoke();assert.equal(response.status,503);assert.equal((await response.json()).code,'DISPATCH_UNCERTAIN');assert.equal(fixture.state.posts.length,1);
  await assert.rejects(approve(db,'PROVIDER_REFUND_CANCEL',{job_id:id}),/may have reached/);assert.equal((await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0].providerReserved,'20.00');
  await ready(db,id);response=await invoke();assert.equal(response.status,200);assert.equal(fixture.state.posts.length,1);let job=(await report(db)).refunds[0];assert.equal(job.proof.status,'succeeded');assert.equal(job.useId,null);
  const posted=await approve(db,'PROVIDER_REFUND_POST',{job_id:id,date:job.postingDate});job=(await report(db)).refunds[0];assert.equal(job.useId,posted.useId);
  let adjustment=await call(db,'get_customer_adjustments',ids.entityA,today);assert.equal(adjustment.control.expected,'40.00');assert.equal(adjustment.control.reconciled,true);assert.equal(adjustment.credits[0].providerReserved,'0.00');
  await assert.rejects(approve(db,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:posted.useId,date:today}),/returned provider funds/);
  fixture.state.status='failed';await ready(db,id);assert.equal((await invoke()).status,200);job=(await report(db)).refunds[0];assert.equal(job.proof.failureBalance.amount,'20.00');assert.equal((await call(db,'get_finance_close_check',ids.entityA,'2026-01-01',today)).providerRefundExceptions,1);
  await approve(db,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:posted.useId,date:job.returnDate});adjustment=await call(db,'get_customer_adjustments',ids.entityA,today);assert.equal(adjustment.control.expected,'60.00');assert.equal(adjustment.control.reconciled,true);assert.equal((await report(db)).refunds[0].reversedOn,job.returnDate);assert.equal(fixture.state.posts.length,1);
 }finally{await db.close();}
});
test('pending provider refunds retain reservations and cannot be posted from a request alone',async()=>{
 const {db,id,fixture,invoke}=await database();try{
  fixture.state.status='pending';assert.equal((await invoke()).status,200);await assert.rejects(approve(db,'PROVIDER_REFUND_POST',{job_id:id,date:today}),/successful provider refund/);
  assert.equal((await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0].providerReserved,'20.00');fixture.state.status='succeeded';await ready(db,id);assert.equal((await invoke()).status,200);assert.equal(fixture.state.posts.length,1);
  await actor(db,ids.adminB);await assert.rejects(report(db),/unavailable/);await assert.rejects(call(db,'request_provider_refund_check',id,null),/scope|unavailable/);await actor(db,ids.adminA);await assert.rejects(call(db,'claim_provider_refund',id),/permission denied/);await assert.rejects(db.exec('SELECT * FROM public.finance_provider_refunds'),/permission denied/);
 }finally{await db.close();}
});
test('invalid source evidence, expired leases and changed approvals cannot dispatch or erase reservations',async()=>{
 const {db,id,fixture,invoke,payload}=await database();try{
  fixture.state.multiplePayments=true;assert.equal((await invoke()).status,503);assert.equal(fixture.state.posts.length,0);await ready(db,id);const claim=await service(db,'claim_provider_refund',id);assert.ok(claim);assert.equal(await service(db,'claim_provider_refund',id),null);
  await assert.rejects(service(db,'mark_provider_refund_dispatch',id,randomUUID(),{}),/lease/);
  const next={...payload,id:randomUUID(),reference:'EXCEEDS-RESERVATION',amount:'40.01'};await assert.rejects(approve(db,'PROVIDER_REFUND',next),/unreserved/);
  await service(db,'release_provider_refund',id,claim.leaseToken,'INVALID_SOURCE');assert.equal((await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0].providerReserved,'20.00');
 }finally{await db.close();}
});
test('the durable dispatch window expires without releasing credit or issuing another payment',async()=>{
 const {db,id,fixture,invoke}=await database();try{
  const lease=await service(db,'claim_provider_refund',id),preflight={invoiceId:'in_acceptance',paymentId:'inpay_acceptance',paymentIntentId:'pi_acceptance',chargeId:'ch_acceptance',receiptAmount:'100.00',currency:'USD',accountId:'acct_acceptance',environment:'TEST'};
  assert.equal((await service(db,'mark_provider_refund_dispatch',id,lease.leaseToken,preflight)).maySend,true);
  // Age only the disposable fixture's dispatch clock to exercise Stripe's key expiry boundary.
  await db.exec("RESET ROLE;SELECT set_config('tapaano.accounting_write','trusted',false)");await db.query("UPDATE public.finance_provider_refunds SET dispatch_started_at=now()-INTERVAL '24 hours' WHERE id=$1",[id]);await db.exec('SET ROLE authenticated');
  assert.equal((await service(db,'mark_provider_refund_dispatch',id,lease.leaseToken,preflight)).maySend,false);await service(db,'release_provider_refund',id,lease.leaseToken,'RECOVERY_REQUIRED');await ready(db,id);
  const response=await invoke();assert.equal(response.status,503);assert.equal((await response.json()).code,'RECOVERY_REQUIRED');assert.equal(fixture.state.posts.length,0);assert.equal((await call(db,'get_customer_adjustments',ids.entityA,today)).credits[0].providerReserved,'20.00');
 }finally{await db.close();}
});
test('reports reject damaged provider amounts and missing retained observations even when database triggers were bypassed',async()=>{
 const {db,id,invoke}=await database();try{
  assert.equal((await invoke()).status,200);const before=await call(db,'get_provider_refund_evidence',id,null,1);assert.equal(before.total,1);
  await db.exec("RESET ROLE;SET session_replication_role=replica");await db.query("UPDATE public.finance_provider_refund_observations SET proof=jsonb_set(proof,'{amount}','\"21.00\"') WHERE refund_id=$1",[id]);await db.exec('SET session_replication_role=origin;SET ROLE authenticated');
  await assert.rejects(report(db),/approved dispatch/);await assert.rejects(call(db,'get_finance_close_check',ids.entityA,'2026-01-01',today),/approved dispatch/);
  await db.exec("RESET ROLE;SET session_replication_role=replica");await db.query('DELETE FROM public.finance_provider_refund_observations WHERE refund_id=$1',[id]);await db.exec('SET session_replication_role=origin;SET ROLE authenticated');await assert.rejects(call(db,'get_provider_refund_evidence',id,null,1),/latest evidence/);
 }finally{await db.close();}
});
