import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
const clearing='30000000-0000-4000-8000-000000000030',connection='60000000-0000-4000-8000-000000000001';let seq=0;
async function approve(db,kind,payload){await actor(db,ids.adminA);const request=await call(db,'request_finance_action',ids.entityA,kind,payload,'Verified synthetic provider source','integration-'+(++seq));await actor(db,reviewer);const result=await call(db,'decide_finance_action',request,'APPROVE','Independent source review');await actor(db,ids.adminA);return result;}
const config={id:connection,label:'Stripe test settlement',provider:'STRIPE',provider_account:'acct_synthetic',environment:'TEST',timezone:'America/New_York',clearing_account_id:clearing,enabled:true,expected_version:0};
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${clearing}','${ids.orgA}','1190','Processor clearing','asset',true);SET ROLE authenticated`);await approve(db,'INTEGRATION_CONFIG',config);return db;}
async function enqueue(db,id,operation,object,source){await db.exec('SET ROLE service_role');try{return await call(db,'enqueue_finance_event',connection,id,operation,object,source,'a'.repeat(64));}finally{await db.exec('SET ROLE authenticated');}}
const balance=(db,account)=>db.query("SELECT round(coalesce(sum(debit-credit),0),2)::text AS balance FROM public.journal_lines WHERE account_id=$1",[account]).then(r=>r.rows[0].balance);
test('verified provider deliveries deduplicate by event and object and require independent posting approval',async()=>{
 const db=await database();try{
  const invoice=await call(db,'post_customer_invoice',ids.entityA,ids.customerA,'PROVIDER-INVOICE','2026-01-01','2026-01-31','USD',0,null,[{description:'Access',quantity:'1',unit_price:'100.00'}],'provider-invoice');
  const source={currency:'USD',date:'2026-01-02',amount:'100.00',type:'invoice.paid'};
  const event=await enqueue(db,'evt_1','RECEIPT','in_1',source);assert.equal(await enqueue(db,'evt_1','RECEIPT','in_1',source),event);assert.equal(await enqueue(db,'evt_2','RECEIPT','in_1',source),event);
  await assert.rejects(enqueue(db,'evt_1','RECEIPT','in_1',{...source,amount:'99.00'}),/idempotency conflict/);
  assert.equal((await db.query('SELECT id FROM public.finance_deliveries')).rows.length,2);
  assert.equal(await balance(db,clearing),'0.00');
  await assert.rejects(call(db,'enqueue_finance_event',connection,'forged','RECEIPT','in_forged',source,'b'.repeat(64)),/permission denied/);
  await approve(db,'APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0});
  const posted=await approve(db,'INTEGRATION_APPLY',{event_id:event,target_id:invoice});assert.ok(posted.receiptId);assert.equal(await balance(db,clearing),'100.00');assert.equal(await balance(db,ids.cashA),'0.00');assert.equal(await balance(db,ids.arA),'0.00');
  await assert.rejects(approve(db,'INTEGRATION_APPLY',{event_id:event,target_id:invoice}),/already decided/);
  await assert.rejects(call(db,'post_customer_receipt_correction',posted.receiptId,'BYPASS','2026-01-03','Direct','bypass'),/integration correction/);
  await approve(db,'INTEGRATION_REVERSE',{event_id:event,date:'2026-01-03'});assert.equal(await balance(db,clearing),'0.00');assert.equal(await balance(db,ids.cashA),'0.00');assert.equal(await balance(db,ids.arA),'100.00');
  const report=await call(db,'get_finance_integration_report',ids.entityA,'2026-01-03');assert.equal(report.events[0].state,'REVERSED');assert.equal(report.controls[0].balance,'0.00');
  await actor(db,ids.adminB);assert.deepEqual((await db.query('SELECT id FROM public.finance_inbox')).rows,[]);
  await assert.rejects(call(db,'request_finance_action',ids.entityB,'INTEGRATION_APPLY',{event_id:event,target_id:invoice},'Cross tenant','cross-tenant'),/unavailable/);
 }finally{await db.close();}
});
test('payouts and signed journal imports preserve clearing fees, source history and atomic reversals',async()=>{
 const db=await database();try{
  const register=await call(db,'create_cash_register',ids.entityA,ids.cashA,'Provider payout bank');
  const event=await enqueue(db,'evt_payout','PAYOUT','po_1',{currency:'USD',date:'2026-01-05',amount:'97.00',type:'payout.paid'});
  const result=await approve(db,'INTEGRATION_APPLY',{event_id:event,target_id:register});assert.equal(await balance(db,ids.cashA),'97.00');assert.equal(await balance(db,clearing),'-97.00');
  await assert.rejects(call(db,'reverse_posted_journal',result.journals[0],'2026-01-06','Direct','direct-reversal'),/integration correction/);
  const fees=await enqueue(db,'evt_fees','JOURNAL','batch_fees',{currency:'USD',date:'2026-01-05',type:'journal.posted',lines:[{account_code:'5000',debit:'3.00',credit:'0.00'},{account_code:'1190',debit:'0.00',credit:'3.00'}]});
  await approve(db,'INTEGRATION_APPLY',{event_id:fees});assert.equal(await balance(db,clearing),'-100.00');assert.equal(await balance(db,ids.expenseA),'3.00');
  await approve(db,'INTEGRATION_REVERSE',{event_id:event,date:'2026-01-06'});assert.equal(await balance(db,ids.cashA),'0.00');assert.equal(await balance(db,clearing),'-3.00');
  const first=await call(db,'get_finance_integration_report',ids.entityA,'2026-01-06',null,1);assert.equal(first.totalEvents,2);assert.equal(first.events.length,1);assert.ok(first.nextCursor);
  const second=await call(db,'get_finance_integration_report',ids.entityA,'2026-01-06',first.nextCursor,1);assert.equal(second.events.length,1);assert.notEqual(first.events[0].id,second.events[0].id);assert.equal(second.nextCursor,null);
 }finally{await db.close();}
});
test('connection changes invalidate pending approvals, disabled ingress fails closed and source writes remain restricted',async()=>{
 const db=await database();try{
  const event=await enqueue(db,'evt_unknown','UNSUPPORTED','evt_unknown',{type:'customer.updated'});
  const request=await call(db,'request_finance_action',ids.entityA,'INTEGRATION_IGNORE',{event_id:event},'Not a financial source','ignore-old');
  await approve(db,'INTEGRATION_CONFIG',{...config,enabled:false,expected_version:1});
  await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',request,'APPROVE','Old configuration'),/source changed/);
  await actor(db,ids.adminA);await assert.rejects(enqueue(db,'evt_late','UNSUPPORTED','evt_late',{type:'customer.updated'}),/unavailable/);
  await approve(db,'INTEGRATION_IGNORE',{event_id:event});
  await assert.rejects(db.query("UPDATE public.finance_inbox SET state='APPLIED'"),/permission denied/);
  await assert.rejects(approve(db,'INTEGRATION_CONFIG',{...config,provider_account:'acct_other',expected_version:2}),/immutable/);
 }finally{await db.close();}
});

test('signed usage posts one exact meter event and restored source lineage rejects unrelated usage evidence',async()=>{
 const db=await database();try{
  const deferred='30000000-0000-4000-8000-000000000040',unbilled='30000000-0000-4000-8000-000000000041';
  await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${deferred}','${ids.orgA}','2300','Deferred revenue','liability',true),('${unbilled}','${ids.orgA}','1150','Unbilled receivables','asset',true);SET ROLE authenticated`);
  const contract=(await approve(db,'CONTRACT_CREATE',{customer_id:ids.customerA,reference:'SIGNED-METER',kind:'USAGE',starts_on:'2026-01-01',ends_on:'2026-01-31',cycle_months:0,price:'0.00',unit_price:'0.0025',timezone:'America/New_York',deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'usage',description:'Metered API calls',standalone_price:'1.00',method:'USAGE'}]})).contractId;
  const event=await enqueue(db,'meter_1','USAGE','meter_object_1',{units:'600000.000001',occurred_at:'2026-01-31T23:00:00Z',type:'usage.recorded'});
  const posted=await approve(db,'INTEGRATION_APPLY',{event_id:event,target_id:contract});assert.ok(posted.usageId);
  const report=await call(db,'get_contract_finance',contract,'2026-01-31');assert.equal(report.cycles[0].usage.units,'600000.000001');
  assert.equal((await call(db,'get_finance_integration_report',ids.entityA,'2026-01-31')).events[0].state,'APPLIED');
  await db.exec('RESET ROLE');await db.query("SELECT set_config('tapaano.accounting_write','trusted',false)");
  await assert.rejects(db.query("UPDATE public.finance_inbox SET source=jsonb_set(source,'{units}','\"600001\"') WHERE id=$1",[event]),/approval lineage mismatch/);
  await db.exec('SET ROLE authenticated');assert.equal((await call(db,'get_finance_integration_report',ids.entityA,'2026-01-31')).events[0].source.units,'600000.000001');
 }finally{await db.close();}
});
