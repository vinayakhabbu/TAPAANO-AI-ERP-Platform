import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call,journal} from './helpers/finance-workflows.mjs';
const deferred='30000000-0000-4000-8000-000000000020',unbilled='30000000-0000-4000-8000-000000000021';
let seq=0;
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${deferred}','${ids.orgA}','2300','Deferred revenue','liability',true),('${unbilled}','${ids.orgA}','1150','Unbilled receivables','asset',true);SET ROLE authenticated`);return db;}
async function approve(db,kind,payload,key='request-'+(++seq)){
 await actor(db,ids.adminA);const request=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic accounting evidence',key);
 await actor(db,reviewer);const result=await call(db,'decide_finance_action',request,'APPROVE','Independent source review');
 await actor(db,ids.adminA);return result;
}
const terms=(reference,overrides={})=>({customer_id:ids.customerA,reference,kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-12-31',cycle_months:0,price:'36500.00',unit_price:'0.00',timezone:'America/New_York',deferred_account_id:deferred,unbilled_account_id:unbilled,
 obligations:[{key:'access',description:'Stand-ready access',standalone_price:'36500.00',method:'DAILY'}],...overrides});
const get=(db,id,date='2026-09-07')=>call(db,'get_contract_finance',id,date);
const bill=(db,cycle,date,number)=>approve(db,'CONTRACT_BILL',{cycle_id:cycle,number,issue_date:date,due_date:date});
const recognize=(db,cycle,date,evidence=[])=>approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:date,evidence});
const accountBalance=(db,account,date)=>db.query('SELECT round(coalesce(sum(l.debit-l.credit),0),2)::text AS balance FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=$1 AND j.entry_date<=$2 AND j.status=\'posted\'',[account,date]).then(r=>r.rows[0].balance);

test('approved annual billing, cumulative daily recognition and AR settlement reconcile independently',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',terms('ANNUAL'))).contractId;
  const cycle=(await get(db,c)).cycles[0].id;const invoice=(await bill(db,cycle,'2026-01-01','ANNUAL-INVOICE')).invoiceId;
  assert.equal(await accountBalance(db,ids.revenueA,'2026-01-01'),'0.00');assert.equal(await accountBalance(db,deferred,'2026-01-01'),'-36500.00');
  assert.equal((await recognize(db,cycle,'2026-01-31')).amount,'3100.00');assert.equal((await recognize(db,cycle,'2026-02-28')).amount,'2800.00');
  const r=await get(db,c,'2026-02-28');assert.deepEqual([r.billed,r.recognized,r.deferred,r.unbilled],['36500.00','5900.00','30600.00','0.00']);
  assert.equal(await accountBalance(db,deferred,'2026-02-28'),'-30600.00');assert.equal(await accountBalance(db,ids.revenueA,'2026-02-28'),'-5900.00');
  const schedule=r.cycles[0].schedule;assert.equal(schedule.at(-1).cumulativeEarned[0].amount,'36500.00');
  await assert.rejects(recognize(db,cycle,'2026-02-28'),/no additional/);await assert.rejects(recognize(db,cycle,'2026-01-31'),/date order/);
  const futureYear=new Date().getUTCFullYear()+1;const future=(await approve(db,'CONTRACT_CREATE',terms('FUTURE',{starts_on:`${futureYear}-01-01`,ends_on:`${futureYear}-12-31`}))).contractId;
  await assert.rejects(recognize(db,(await get(db,future)).cycles[0].id,`${futureYear}-01-31`),/future/);
  await call(db,'post_customer_receipt_amount',invoice,'ANNUAL-FIRST','2026-01-05','USD','First transfer','annual-first','15000.00');
  const ar=await call(db,'get_subledger_aging',ids.entityA,'ar','2026-01-05',0,200,null);assert.equal(ar.outstanding,'21500.00');assert.equal(ar.reconciled,true);
  await call(db,'post_customer_receipt_amount',invoice,'ANNUAL-FINAL','2026-01-20','USD','Final transfer','annual-final','21500.00');
  assert.equal((await call(db,'get_subledger_aging',ids.entityA,'ar','2026-01-20',0,200,null)).outstanding,'0.00');
  await assert.rejects(approve(db,'CONTRACT_CREDIT',{cycle_id:cycle,number:'SETTLED-CREDIT',date:'2026-03-01'}),/receipt|settle/);
 }finally{await db.close();}
});
test('monthly subscription cycles and bundle obligations preserve exact allocations and transfer evidence',async()=>{
 const db=await database();try{
  const monthly=(await approve(db,'CONTRACT_CREATE',terms('MONTHLY',{cycle_months:1,price:'1200.00'}))).contractId;
  let r=await get(db,monthly);assert.equal(r.cycles.length,12);assert.ok(r.cycles.every(x=>x.price==='1200.00'));const cycle=r.cycles[0].id;
  await bill(db,cycle,'2026-01-01','MONTHLY-JAN');assert.equal((await recognize(db,cycle,'2026-01-31')).amount,'1200.00');
  await assert.rejects(bill(db,cycle,'2026-01-01','MONTHLY-DUPLICATE'),/already billed/);
  const bundle=(await approve(db,'CONTRACT_CREATE',terms('BUNDLE',{ends_on:'2026-03-31',price:'12000.00',obligations:[{key:'access',description:'Access',standalone_price:'12000.00',method:'DAILY'},{key:'training',description:'Distinct training',standalone_price:'3000.00',method:'MILESTONE'}]}))).contractId;
  r=await get(db,bundle);assert.deepEqual(r.cycles[0].allocations.map(x=>x.amount),['9600.00','2400.00']);const bc=r.cycles[0].id;await bill(db,bc,'2026-01-01','BUNDLE-INVOICE');
  assert.equal((await recognize(db,bc,'2026-01-31',[{key:'training',satisfied_on:'2026-01-20',reference:'ACCEPTANCE-001'}])).amount,'5706.67');
  assert.equal((await recognize(db,bc,'2026-02-28')).amount,'2986.66');assert.equal((await recognize(db,bc,'2026-03-31')).amount,'3306.67');
  r=await get(db,bundle,'2026-03-31');assert.equal(r.recognized,'12000.00');assert.equal(r.deferred,'0.00');
 }finally{await db.close();}
});
test('deduplicated usage recognizes unbilled service before an arrears invoice and clears its contract asset',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',terms('USAGE',{kind:'USAGE',ends_on:'2026-01-31',price:'0.00',unit_price:'0.0025',obligations:[{key:'usage',description:'Requests consumed',standalone_price:'1.00',method:'USAGE'}]}))).contractId;
  const id1=await call(db,'record_contract_usage',c,'meter','usage-1','2026-01-10T15:00:00Z','250000',null);
  assert.equal(await call(db,'record_contract_usage',c,'meter','usage-1','2026-01-10T15:00:00Z','250000.000000',null),id1);
  await assert.rejects(call(db,'record_contract_usage',c,'meter','usage-1','2026-01-10T15:00:00Z','250001',null),/idempotency/);
  await call(db,'record_contract_usage',c,'meter','usage-2','2026-01-31T23:00:00Z','350000',null);
  let r=await get(db,c),s=r.cycles[0];assert.equal(s.usage.units,'600000');
  await assert.rejects(approve(db,'CONTRACT_USAGE_CLOSE',{cycle_id:s.id,revision:s.usage.revision,expected_units:'599999'}),/control total/);
  await approve(db,'CONTRACT_USAGE_CLOSE',{cycle_id:s.id,revision:s.usage.revision,expected_units:'600000'});
  assert.equal((await recognize(db,s.id,'2026-01-31')).amount,'1500.00');
  r=await get(db,c,'2026-01-31');assert.deepEqual([r.billed,r.recognized,r.unbilled,r.deferred],['0.00','1500.00','1500.00','0.00']);assert.equal(await accountBalance(db,unbilled,'2026-01-31'),'1500.00');
  await bill(db,s.id,'2026-02-01','USAGE-INVOICE');r=await get(db,c,'2026-02-01');assert.deepEqual([r.billed,r.recognized,r.unbilled,r.deferred],['1500.00','1500.00','0.00','0.00']);
  assert.equal(await accountBalance(db,unbilled,'2026-02-01'),'0.00');assert.equal(await accountBalance(db,ids.revenueA,'2026-02-01'),'-1500.00');
  await assert.rejects(call(db,'record_contract_usage',c,'meter','late','2026-01-31T23:01:00Z','1',null),/finalized/);
 }finally{await db.close();}
});
test('usage billed before catch-up recognition posts both dated contract asset and invoice-date clearing',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',terms('USAGE-LATE',{kind:'USAGE',ends_on:'2026-01-31',unit_price:'0.0025',obligations:[{key:'usage',description:'Requests',standalone_price:'1.00',method:'USAGE'}]}))).contractId;
  const original=await call(db,'record_contract_usage',c,'meter','wrong','2026-01-10T15:00:00Z','600001',null);
  await call(db,'record_contract_usage',c,'meter','offset','2026-01-10T15:00:00Z','-600001',original);
  await call(db,'record_contract_usage',c,'meter','correct','2026-01-10T15:00:00Z','600000',null);
  let s=(await get(db,c)).cycles[0];await approve(db,'CONTRACT_USAGE_CLOSE',{cycle_id:s.id,revision:s.usage.revision,expected_units:'600000'});
  await bill(db,s.id,'2026-02-01','USAGE-LATE-INVOICE');await recognize(db,s.id,'2026-01-31');
  assert.equal(await accountBalance(db,unbilled,'2026-01-31'),'1500.00');assert.equal(await accountBalance(db,unbilled,'2026-02-01'),'0.00');assert.equal(await accountBalance(db,deferred,'2026-02-01'),'0.00');
 }finally{await db.close();}
});
test('unpaid contract credits reverse recognized revenue and remaining deferral without editing original evidence',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',terms('CREDIT',{ends_on:'2026-01-31',price:'1200.00'}))).contractId;
  const cycle=(await get(db,c)).cycles[0].id;const invoice=(await bill(db,cycle,'2026-01-01','CREDIT-INVOICE')).invoiceId;
  await recognize(db,cycle,'2026-01-15');await assert.rejects(call(db,'post_customer_credit_note',invoice,'UNSAFE-CREDIT','2026-01-31','Direct credit','unsafe-credit'),/contract credit workflow/);
  await approve(db,'CONTRACT_CREDIT',{cycle_id:cycle,number:'CONTRACT-CREDIT',date:'2026-01-31'});
  const r=await get(db,c,'2026-01-31');assert.deepEqual([r.billed,r.recognized,r.deferred,r.unbilled],['0.00','0.00','0.00','0.00']);
  for(const account of [ids.arA,ids.revenueA,deferred,unbilled])assert.equal(await accountBalance(db,account,'2026-01-31'),'0.00');
  await assert.rejects(recognize(db,cycle,'2026-01-31'),/unavailable/);
 }finally{await db.close();}
});
test('independent finance policy blocks direct posting and keeps rejected, stale and cross-tenant requests atomic',async()=>{
 const db=await database();try{
  await approve(db,'APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0});
  await assert.rejects(journal(db,'BYPASS','2026-01-01','1.00'),/independent finance approval/);
  const payload={number:'APPROVED-JOURNAL',date:'2026-01-01',memo:'Reviewed cash',lines:[{account_id:ids.cashA,debit:'10.00',credit:'0.00'},{account_id:ids.revenueA,debit:'0.00',credit:'10.00'}]};
  const request=await call(db,'request_finance_action',ids.entityA,'MANUAL_JOURNAL',payload,'Evidence','journal-review');
  await assert.rejects(call(db,'decide_finance_action',request,'APPROVE','Own approval'),/independent/);
  await actor(db,ids.adminB);await assert.rejects(call(db,'decide_finance_action',request,'APPROVE','Other tenant'),/unavailable/);
  await actor(db,reviewer);const result=await call(db,'decide_finance_action',request,'APPROVE','Verified');assert.ok(result.journalId);assert.deepEqual(await call(db,'decide_finance_action',request,'APPROVE','Verified'),result);
  await actor(db,ids.adminA);await assert.rejects(approve(db,'APPROVAL_POLICY',{journals_required:false,payments_required:false,expected_version:0}),/policy changed/);
  await actor(db,ids.adminA);await assert.rejects(db.query("UPDATE public.finance_requests SET state='APPROVED'"),/permission denied/);
  const c=(await approve(db,'CONTRACT_CREATE',terms('SECURED'))).contractId;const cycle=(await get(db,c)).cycles[0].id;await bill(db,cycle,'2026-01-01','SECURED-INVOICE');await recognize(db,cycle,'2026-01-31');
  await actor(db,ids.adminB);await assert.rejects(get(db,c),/unavailable/);assert.deepEqual((await db.query('SELECT id FROM public.finance_contracts')).rows,[]);
 }finally{await db.close();}
});

test('required payment approval covers partial settlement, correction and replacement and cannot be bypassed',async()=>{
 const db=await database();try{
  const invoice=await call(db,'post_supplier_bill',ids.entityA,ids.vendorA,'APPROVAL-BILL','2026-01-01','2026-01-31','USD',0,null,[{description:'Service',quantity:'1',unit_price:'100.00'}],'approval-bill');
  await approve(db,'APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0});
  await assert.rejects(call(db,'post_supplier_payment_amount',invoice,'DIRECT','2026-01-02','USD','No approval','direct','40.00'),/independent finance approval/);
  const payment=(await approve(db,'SUPPLIER_PAYMENT',{bill_id:invoice,number:'APPROVED-PAY',date:'2026-01-02',amount:'40.00',reference:'Reviewed remittance'})).paymentId;
  await assert.rejects(call(db,'post_supplier_payment_correction',payment,'DIRECT-CORRECTION','2026-01-03','Unapproved','direct-correction'),/independent finance approval/);
  const correction=(await approve(db,'SUPPLIER_PAYMENT_CORRECTION',{source_id:payment,number:'APPROVED-CORRECTION',date:'2026-01-03',reference:'Approved correction'})).correctionId;
  await approve(db,'SUPPLIER_PAYMENT_REPLACEMENT',{source_id:correction,number:'APPROVED-REPLACE',date:'2026-01-04',reference:'Approved replacement'});
  const aging=await call(db,'get_subledger_aging',ids.entityA,'ap','2026-01-04',0,200,null);assert.equal(aging.outstanding,'60.00');assert.equal(aging.reconciled,true);
 }finally{await db.close();}
});
test('prospective pricing and cancellation preserve earlier cycles and require independent approval',async()=>{
 const db=await database();try{
  const year=new Date().getUTCFullYear()+1;
  const c=(await approve(db,'CONTRACT_CREATE',terms('AMEND',{starts_on:`${year}-01-01`,ends_on:`${year}-12-31`,cycle_months:1,price:'1200.00'}))).contractId;
  await approve(db,'CONTRACT_AMEND',{contract_id:c,effective_cycle:10,action:'REPRICE',new_price:'1500.00'});
  let r=await get(db,c);assert.equal(r.cycles[8].price,'1200.00');assert.equal(r.cycles[9].price,'1500.00');
  await approve(db,'CONTRACT_AMEND',{contract_id:c,effective_cycle:11,action:'CANCEL',new_price:'0.00'});
  r=await get(db,c);assert.equal(r.cycles[10].cancelled,true);await assert.rejects(bill(db,r.cycles[10].id,'2026-11-01','CANCELLED'),/unavailable/);
  const past=(await approve(db,'CONTRACT_CREATE',terms('PAST-AMEND',{cycle_months:1,price:'1200.00'}))).contractId;
  await assert.rejects(approve(db,'CONTRACT_AMEND',{contract_id:past,effective_cycle:1,action:'REPRICE',new_price:'500.00'}),/prospective|untouched/);
 }finally{await db.close();}
});
test('contract control variances are explicit and contract source journals reject independent reversals',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',terms('LINEAGE',{ends_on:'2026-01-31',price:'1200.00'}))).contractId;
  const cycle=(await get(db,c)).cycles[0].id;await bill(db,cycle,'2026-01-01','LINEAGE-INVOICE');const recognized=await recognize(db,cycle,'2026-01-31');
  assert.ok((await get(db,c)).controls.every(x=>x.variance==='0.00'));
  await assert.rejects(call(db,'reverse_posted_journal',recognized.journalId,'2026-02-01','Unsupported standalone reversal','bad-reversal'),/contract journals/);
  await call(db,'post_manual_journal',ids.entityA,'MANUAL-CONTROL','2026-02-01','Source variance',[{account_id:ids.expenseA,debit:'1.00',credit:'0.00'},{account_id:deferred,debit:'0.00',credit:'1.00'}],'control-variance');
  assert.equal((await get(db,c)).controls.find(x=>x.accountId===deferred).variance,'1.00');
  await db.exec('RESET ROLE');await db.query("SELECT set_config('tapaano.accounting_write','trusted',false)");
  await assert.rejects(db.query('UPDATE public.finance_revenue_entries SET transfer_journal=journal_id WHERE cycle_id=$1',[cycle]),/contract journal|dated contract/);
  await db.exec('SET ROLE authenticated');
  assert.equal((await get(db,c)).controls.find(x=>x.accountId===deferred).variance,'1.00');
 }finally{await db.close();}
});
