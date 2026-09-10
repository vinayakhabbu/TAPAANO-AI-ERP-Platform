import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call as rawCall} from './helpers/finance-workflows.mjs';
async function call(db,name,...args){try{return await rawCall(db,name,...args);}catch(e){e.message+=` [${name}: ${e.detail??''} ${e.where??''}]`;throw e;}}
import {loadTypescript} from './helpers/load-typescript.mjs';
const {parseSubscriptionHistory}=await loadTypescript('../../src/lib/subscriptionLifecycle.ts');
const liability='30000000-0000-4000-8000-000000000090',deferred='30000000-0000-4000-8000-000000000091',unbilled='30000000-0000-4000-8000-000000000092';let sequence=0;
async function request(db,kind,payload){await actor(db,ids.adminA);try{return await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic signed subscription change','subscription-'+(++sequence));}catch(e){e.message+=` [${kind}: ${e.detail??''} ${e.where??''}]`;throw e;}}
async function approve(db,kind,payload){const req=await request(db,kind,payload);await actor(db,reviewer);const r=await call(db,'decide_finance_action',req,'APPROVE','Independent subscription review');await actor(db,ids.adminA);return r;}
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${liability}','${ids.orgA}','2398','Subscription customer credits','liability',true),('${deferred}','${ids.orgA}','2388','Subscription deferred service','liability',true),('${unbilled}','${ids.orgA}','1188','Subscription unbilled service','asset',true);SET ROLE authenticated`);await approve(db,'CUSTOMER_CREDIT_POLICY',{liability_account_id:liability});await call(db,'create_cash_register',ids.entityA,ids.cashA,'Subscription bank');return db;}
const terms=(reference,extra={})=>({customer_id:ids.customerA,reference,kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-03-31',cycle_months:1,price:'3100.00',timezone:'America/New_York',deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'access',description:'Daily service access',standalone_price:'3100.00',method:'DAILY'}],...extra});
const create=async(db,ref,extra={})=>(await approve(db,'CONTRACT_CREATE',terms(ref,extra))).contractId;
const report=(db,id,date='2026-01-31')=>call(db,'get_contract_finance',id,date);
const bill=async(db,cycle,date='2026-01-01')=>(await approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'SUB-I-'+(++sequence),issue_date:date,due_date:date})).invoiceId;
const modification=(id,extra={})=>({contract_id:id,action:'CHANGE',effective_on:'2026-01-16',reference:'REPLACEMENT-'+(++sequence),credit_reference:'UNUSED-'+sequence,unit_price:'6200.00',quantity:'1',discount_percent:'0.00',...extra});

test('mid-cycle upgrade atomically recognizes delivered service, credits unused time and preserves the billing anchor',async()=>{
 const db=await database();try{
  const id=await create(db,'ORIGINAL'),oldCycle=(await report(db,id)).cycles[0].id,invoice=await bill(db,oldCycle);
  await call(db,'post_customer_receipt_amount',invoice,'SUB-PAID','2026-01-02','USD','Confirmed payment','sub-paid','3100.00');
  const payload=modification(id),preview=await call(db,'preview_subscription_action',ids.entityA,'SUBSCRIPTION_CHANGE',payload);
  assert.deepEqual([preview.earnedBeforeChange,preview.catchUpRecognition,preview.unusedCredit],['1500.00','1500.00','1600.00']);assert.deepEqual(preview.actions.map(a=>a.slot),['EARNED','UNUSED','REPLACEMENT']);
  const change=await approve(db,'SUBSCRIPTION_CHANGE',payload);assert.equal(change.unusedCredit,'1600.00');
  const before=await report(db,id,'2026-01-15'),after=await report(db,id);assert.deepEqual([before.billed,before.recognized,before.deferred],['3100.00','1500.00','1600.00']);assert.deepEqual([after.billed,after.recognized,after.deferred],['1500.00','1500.00','0.00']);assert.ok(after.cycles.every(c=>c.cancelled));assert.ok(after.controls.every(c=>c.variance==='0.00'));
  const replacement=await report(db,change.replacementId);assert.deepEqual(replacement.cycles.map(c=>[c.startsOn,c.endsOn,c.price]),[['2026-01-16','2026-01-31','3200.00'],['2026-02-01','2026-02-28','6200.00'],['2026-03-01','2026-03-31','6200.00']]);
  const newInvoice=await bill(db,replacement.cycles[0].id,'2026-01-16');await approve(db,'CUSTOMER_CREDIT_APPLY',{credit_id:change.creditId,date:'2026-01-16',amount:'1600.00',reference:'SUB-APPLY',invoice_id:newInvoice});
  const ar=await call(db,'get_subledger_aging',ids.entityA,'ar','2026-01-31',0,200,null);assert.equal(ar.outstanding,'1600.00');assert.equal(ar.reconciled,true);
  await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:replacement.cycles[0].id,as_of:'2026-01-31',evidence:[]});assert.equal((await report(db,change.replacementId)).recognized,'3200.00');
  await assert.rejects(approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:change.creditId,date:'2026-01-16'}),/approved subscription/);
  await assert.rejects(approve(db,'SUBSCRIPTION_REVERSE',{change_id:change.changeId,date:'2026-01-16'}),/replacement subscription has activity/i);
  const h=parseSubscriptionHistory(await call(db,'get_subscription_history',id));assert.equal(h.changes[0].replacementId,change.replacementId);
 }finally{await db.close();}
});
test('discounted seat downgrade and cancellation use exact partial-period consideration across chained changes',async()=>{
 const db=await database();try{
  const id=await create(db,'SEATS'),cycle=(await report(db,id)).cycles[0].id;await bill(db,cycle);
  const change=await approve(db,'SUBSCRIPTION_CHANGE',modification(id,{unit_price:'1000.00',quantity:'2',discount_percent:'7.50'}));
  let replacement=await report(db,change.replacementId);assert.equal(replacement.cycles[0].price,'954.84');assert.equal(replacement.cycles[1].price,'1850.00');
  await bill(db,replacement.cycles[0].id,'2026-01-16');
  const cancel=await approve(db,'SUBSCRIPTION_CHANGE',{contract_id:change.replacementId,action:'CANCEL',effective_on:'2026-01-24',credit_reference:'SEAT-CANCEL'});
  assert.equal(cancel.replacementId,null);assert.equal(cancel.unusedCredit,'477.42');assert.equal(cancel.catchUpRecognition,'477.42');
  replacement=await report(db,change.replacementId);assert.deepEqual([replacement.billed,replacement.recognized,replacement.deferred],['477.42','477.42','0.00']);assert.ok(replacement.controls.every(c=>c.variance==='0.00'));
 }finally{await db.close();}
});
test('original month-end anchor survives a February modification and an explicit renewal produces a new finite term',async()=>{
 const db=await database();try{
  const id=await create(db,'MONTH-END',{starts_on:'2026-01-31',ends_on:'2026-05-30',price:'2800.00'}),cycles=(await report(db,id)).cycles;await bill(db,cycles[1].id,'2026-02-28');
  const change=await approve(db,'SUBSCRIPTION_CHANGE',modification(id,{effective_on:'2026-03-15',unit_price:'3100.00'}));const r=await report(db,change.replacementId,'2026-03-31');
  assert.deepEqual(r.cycles.map(c=>[c.startsOn,c.endsOn,c.price]),[['2026-03-15','2026-03-30','1600.00'],['2026-03-31','2026-04-29','3100.00'],['2026-04-30','2026-05-30','3100.00']]);
  const renewal=await approve(db,'SUBSCRIPTION_RENEW',{contract_id:change.replacementId,reference:'RENEWED-TERM',ends_on:'2026-08-30',unit_price:'1000.00',quantity:'3',discount_percent:'10.00'});
  const rr=await report(db,renewal.replacementId,'2026-08-30');assert.equal(rr.cycles.length,3);assert.deepEqual(rr.cycles.map(c=>c.price),['2700.00','2700.00','2700.00']);assert.equal(rr.cycles[0].startsOn,'2026-05-31');assert.equal(rr.cycles[2].endsOn,'2026-08-30');
  await assert.rejects(approve(db,'SUBSCRIPTION_RENEW',{contract_id:change.replacementId,reference:'DUPLICATE-RENEWAL',ends_on:'2026-08-30',unit_price:'1000.00',quantity:'3',discount_percent:'10.00'}),/already changed or renewed/);
 }finally{await db.close();}
});
test('an unused replacement can be corrected atomically without undoing earned revenue',async()=>{
 const db=await database();try{
  const id=await create(db,'RESTORE');await bill(db,(await report(db,id)).cycles[0].id);
  const change=await approve(db,'SUBSCRIPTION_CHANGE',modification(id));await approve(db,'SUBSCRIPTION_REVERSE',{change_id:change.changeId,date:'2026-01-16'});
  const original=await report(db,id),replacement=await report(db,change.replacementId);assert.equal(original.billed,'3100.00');assert.equal(original.recognized,'1500.00');assert.equal(original.deferred,'1600.00');assert.ok(original.cycles.every(c=>!c.cancelled));assert.ok(replacement.cycles.every(c=>c.cancelled));assert.ok(original.controls.every(c=>c.variance==='0.00'));
  await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:original.cycles[0].id,as_of:'2026-01-31',evidence:[]});assert.equal((await report(db,id)).recognized,'3100.00');
  assert.equal((await call(db,'get_subscription_history',id)).changes[0].reversedOn,'2026-01-16');
 }finally{await db.close();}
});
test('subscription review rejects stale service, tenant access and attempts to invoke child credits directly',async()=>{
 const db=await database();try{
  const id=await create(db,'STALE-SERVICE'),cycle=(await report(db,id)).cycles[0].id;await bill(db,cycle);const p=modification(id);const preview=await call(db,'preview_subscription_action',ids.entityA,'SUBSCRIPTION_CHANGE',p);
  await assert.rejects(request(db,'CUSTOMER_CREDIT',preview.actions.find(a=>a.slot==='UNUSED').payload),/approved subscription/);
  const req=await request(db,'SUBSCRIPTION_CHANGE',p);await assert.rejects(call(db,'decide_finance_action',req,'APPROVE','Self'),/independent/);
  await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-10',evidence:[]});await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',req,'APPROVE','Old plan'),/source changed/);
  await actor(db,ids.adminB);await assert.rejects(call(db,'get_subscription_history',id),/unavailable/);await assert.rejects(call(db,'preview_subscription_action',ids.entityA,'SUBSCRIPTION_CHANGE',p),/unavailable/);assert.equal((await db.query('SELECT * FROM public.finance_subscription_changes')).rows.length,0);
  await actor(db,ids.adminA);await assert.rejects(call(db,'execute_subscription_child',req,'UNUSED'),/permission denied/);await assert.rejects(db.exec('UPDATE public.finance_subscription_changes SET action=action'),/permission denied/);
 }finally{await db.close();}
});

test('a failed final child rolls back recognition, credit and every approved child atomically',async()=>{
 const db=await database();try{
  const id=await create(db,'ATOMIC-SOURCE');await bill(db,(await report(db,id)).cycles[0].id);await create(db,'ALREADY-TAKEN');
  await assert.rejects(approve(db,'SUBSCRIPTION_CHANGE',modification(id,{reference:'ALREADY-TAKEN'})),/duplicate key/);
  const r=await report(db,id);assert.equal(r.recognized,'0.00');assert.equal(r.deferred,'3100.00');assert.ok(r.cycles.every(c=>!c.cancelled));
  assert.equal((await call(db,'get_customer_adjustments',ids.entityA,'2026-01-31')).credits.length,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.finance_subscription_actions')).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.finance_requests WHERE request_key LIKE 'subscription:%'")).rows[0].n,0);
 }finally{await db.close();}
});
test('future repricing of an anchored replacement keeps its partial first cycle and rejects imprecise pricing metadata',async()=>{
 const db=await database();try{
  const id=await create(db,'FUTURE-ANCHOR',{starts_on:'2027-01-15',ends_on:'2027-03-31',price:'31.00',billing_anchor:'2027-01-01',billing_offset:0});
  assert.equal((await report(db,id)).cycles[0].price,'17.00');await approve(db,'CONTRACT_AMEND',{contract_id:id,effective_cycle:1,action:'REPRICE',new_price:'62.00'});const r=await report(db,id);assert.deepEqual(r.cycles.map(c=>c.price),['34.00','62.00','62.00']);
  await assert.rejects(approve(db,'CONTRACT_CREATE',terms('INVALID-PRICE',{starts_on:'2027-01-15',ends_on:'2027-03-31',price:'31.00',billing_anchor:'2027-01-01',billing_offset:0,pricing:{unit_price:31,quantity:'1',discount_percent:'0.00'}})),/exact.*pricing/);
 }finally{await db.close();}
});

test('a zero-cent partial cycle can be marked billed and replaced without inventing a credit or recognition journal',async()=>{
 const db=await database();try{
  const id=await create(db,'PENNY-SOURCE',{price:'0.01'});await bill(db,(await report(db,id)).cycles[0].id);
  const first=await approve(db,'SUBSCRIPTION_CHANGE',modification(id,{effective_on:'2026-01-31',unit_price:'0.01'}));assert.equal(first.unusedCredit,'0.00');assert.equal(first.creditId,null);
  const small=(await report(db,first.replacementId)).cycles[0];assert.equal(small.price,'0.00');assert.equal(await bill(db,small.id,'2026-01-31'),null);
  const next=await approve(db,'SUBSCRIPTION_CHANGE',modification(first.replacementId,{effective_on:'2026-01-31',unit_price:'1.00'}));assert.equal(next.creditId,null);assert.equal(next.catchUpRecognition,'0.00');assert.equal((await report(db,next.replacementId)).cycles[0].price,'0.03');
  parseSubscriptionHistory(await call(db,'get_subscription_history',first.replacementId));await approve(db,'SUBSCRIPTION_REVERSE',{change_id:next.changeId,date:'2026-01-31'});assert.equal((await report(db,first.replacementId)).cycles[0].cancelled,false);
 }finally{await db.close();}
});
