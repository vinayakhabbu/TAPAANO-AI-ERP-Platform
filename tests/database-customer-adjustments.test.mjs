import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {parseCustomerAdjustments,customerAdjustmentCsv}=await loadTypescript('../../src/lib/customerAdjustments.ts');
const liability='30000000-0000-4000-8000-000000000080',deferred='30000000-0000-4000-8000-000000000081',unbilled='30000000-0000-4000-8000-000000000082';
let sequence=0;
async function approve(db,kind,payload){await actor(db,ids.adminA);const req=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic customer evidence','customer-'+(++sequence));await actor(db,reviewer);const result=await call(db,'decide_finance_action',req,'APPROVE','Independent customer evidence review');await actor(db,ids.adminA);return result;}
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${liability}','${ids.orgA}','2390','Customer credits','liability',true),('${deferred}','${ids.orgA}','2380','Deferred service','liability',true),('${unbilled}','${ids.orgA}','1180','Unbilled service','asset',true);SET ROLE authenticated`);await approve(db,'CUSTOMER_CREDIT_POLICY',{liability_account_id:liability});await call(db,'create_cash_register',ids.entityA,ids.cashA,'Operating bank');return db;}
const invoice=(db,reference,amount='100.00',date='2026-01-01')=>call(db,'post_customer_invoice',ids.entityA,ids.customerA,reference,date,date,'USD',0,'Synthetic invoice',[{description:'Service',quantity:'1',unit_price:amount}],reference);
const receipt=(db,id,amount,reference='PAYMENT')=>call(db,'post_customer_receipt_amount',id,reference,'2026-01-02','USD','Confirmed bank transfer',reference,amount);
const get=async(db,date='2026-01-31')=>parseCustomerAdjustments(await call(db,'get_customer_adjustments',ids.entityA,date));
async function credit(db,id,amount,date='2026-01-03'){const i=(await get(db)).invoices.find(x=>x.id===id);return approve(db,'CUSTOMER_CREDIT',{invoice_id:id,reference:'CREDIT-'+(++sequence),date,lines:[{line_id:i.lines[0].id,amount}]});}
const ar=(db,date='2026-01-31')=>call(db,'get_subledger_aging',ids.entityA,'ar',date,0,200,null);

test('partial customer credits preserve invoice history and reduce the remaining receipt capacity',async()=>{
 const db=await database();try{
  const id=await invoice(db,'PARTIAL');const c=await credit(db,id,'25.00');assert.deepEqual([c.arAmount,c.balanceAmount],['25.00','0.00']);
  assert.equal((await ar(db,'2026-01-02')).outstanding,'100.00');assert.equal((await ar(db)).outstanding,'75.00');assert.equal((await ar(db)).reconciled,true);
  await assert.rejects(call(db,'post_customer_receipt_amount',id,'OVER','2026-01-04','USD','Bank','over','75.01'),/balance|exceed/);
  await call(db,'post_customer_receipt_amount',id,'FINAL','2026-01-04','USD','Bank','final','75.00');assert.equal((await ar(db)).outstanding,'0.00');
  await assert.rejects(credit(db,id,'75.01','2026-01-05'),/uncredited/);
  const original=(await db.query('SELECT total::text,reversed_by_id FROM public.invoices i JOIN public.journal_entries j ON j.id=i.journal_entry_id WHERE i.id=$1',[id])).rows[0];assert.deepEqual(original,{total:'100.00',reversed_by_id:null});
  await assert.rejects(call(db,'reverse_posted_journal',c.journalId,'2026-01-06','Bypass','bypass'),/linked independent/);
 }finally{await db.close();}
});
test('paid invoice credits, partial refunds, applications and corrections reconcile at every cutoff',async()=>{
 const db=await database();try{
  const id=await invoice(db,'PAID'),r=await receipt(db,id,'100.00'),c=await credit(db,id,'60.00');assert.deepEqual([c.arAmount,c.balanceAmount],['0.00','60.00']);
  const refund=await approve(db,'CUSTOMER_REFUND',{credit_id:c.creditId,date:'2026-01-04',amount:'20.00',reference:'BANK-REFUND-20',cash_account_id:ids.cashA,settlement_id:r,settlement_kind:'RECEIPT'});
  const next=await invoice(db,'NEXT','30.00','2026-01-05');const applied=await approve(db,'CUSTOMER_CREDIT_APPLY',{credit_id:c.creditId,date:'2026-01-05',amount:'30.00',reference:'APPLY-30',invoice_id:next});
  let report=await get(db);assert.equal(report.control.expected,'10.00');assert.equal(report.control.reconciled,true);assert.equal((await ar(db)).outstanding,'0.00');assert.equal((await ar(db)).reconciled,true);
  await assert.rejects(approve(db,'CUSTOMER_REFUND',{credit_id:c.creditId,date:'2026-01-06',amount:'10.01',reference:'OVER',cash_account_id:ids.cashA,settlement_id:r,settlement_kind:'RECEIPT'}),/available/);
  await assert.rejects(call(db,'post_customer_receipt_correction',r,'CORRECTION','2026-01-06','Bad receipt','correct-receipt'),/resolve customer credits/);
  await assert.rejects(approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:c.creditId,date:'2026-01-06'}),/active refunds/);
  await approve(db,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:applied.useId,date:'2026-01-06'});assert.equal((await ar(db)).outstanding,'30.00');assert.equal((await ar(db)).reconciled,true);
  await approve(db,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:refund.useId,date:'2026-01-07'});await approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:c.creditId,date:'2026-01-08'});
  report=await get(db);assert.deepEqual([report.control.expected,report.control.ledger,report.credits[0].reversedOn],['0.00','0.00','2026-01-08']);
  assert.equal((await get(db,'2026-01-04')).control.expected,'40.00');assert.equal((await get(db,'2026-01-05')).control.expected,'10.00');assert.equal((await ar(db)).reconciled,true);
 }finally{await db.close();}
});
test('partially paid credit splits receivable and refund liability without creating cash',async()=>{
 const db=await database();try{
  const id=await invoice(db,'SPLIT');await receipt(db,id,'40.00');const c=await credit(db,id,'80.00');assert.deepEqual([c.arAmount,c.balanceAmount],['60.00','20.00']);assert.equal((await ar(db)).reconciled,true);
  const control=(await get(db)).control;assert.deepEqual([control.expected,control.ledger],['20.00','20.00']);
  await approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:c.creditId,date:'2026-01-04'});assert.equal((await ar(db)).outstanding,'60.00');assert.equal((await ar(db)).reconciled,true);
 }finally{await db.close();}
});
test('contract concession reduces recognized and deferred amounts while future service recognizes only net consideration',async()=>{
 const db=await database();try{
  const c=(await approve(db,'CONTRACT_CREATE',{customer_id:ids.customerA,reference:'CONCESSION',kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-01-31',cycle_months:0,price:'3100.00',timezone:'America/New_York',deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'access',description:'Daily access',standalone_price:'3100.00',method:'DAILY'}]})).contractId;
  const cycle=(await call(db,'get_contract_finance',c,'2026-01-31')).cycles[0].id;
  const inv=(await approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'CONCESSION-I',issue_date:'2026-01-01',due_date:'2026-01-01'})).invoiceId;
  await receipt(db,inv,'3100.00');await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-10',evidence:[]});
  await credit(db,inv,'1550.00','2026-01-11');let report=await call(db,'get_contract_finance',c,'2026-01-11');assert.deepEqual([report.billed,report.recognized,report.deferred],['1550.00','500.00','1050.00']);assert.ok(report.controls.every(c=>c.variance==='0.00'));
  assert.equal((await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-31',evidence:[]})).amount,'1050.00');report=await call(db,'get_contract_finance',c,'2026-01-31');assert.deepEqual([report.billed,report.recognized,report.deferred],['1550.00','1550.00','0.00']);assert.ok(report.controls.every(c=>c.variance==='0.00'));assert.equal(report.cycles[0].schedule[0].cumulativeEarned[0].amount,'1550.00');
  const before=await call(db,'get_contract_finance',c,'2026-01-10');assert.deepEqual([before.billed,before.recognized],['3100.00','1000.00']);
 }finally{await db.close();}
});
test('customer adjustment review is independent, tenant scoped, immutable and rejects stale payment state',async()=>{
 const db=await database();try{
  const id=await invoice(db,'STALE');const line=(await get(db)).invoices[0].lines[0].id;
  const payload={invoice_id:id,reference:'STALE-CREDIT',date:'2026-01-03',lines:[{line_id:line,amount:'50.00'}]};
  const req=await call(db,'request_finance_action',ids.entityA,'CUSTOMER_CREDIT',payload,'Customer evidence','stale-credit');assert.equal(await call(db,'request_finance_action',ids.entityA,'CUSTOMER_CREDIT',payload,'Customer evidence','stale-credit'),req);
  await assert.rejects(call(db,'decide_finance_action',req,'APPROVE','Self'),/independent/);await receipt(db,id,'60.00');await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',req,'APPROVE','Review'),/source changed/);
  await actor(db,ids.adminB);await assert.rejects(call(db,'get_customer_adjustments',ids.entityA,'2026-01-31'),/scope|unavailable/);assert.equal((await db.query('SELECT * FROM public.finance_customer_credit_controls')).rows.length,0);
  await actor(db,ids.adminA);await assert.rejects(db.exec('UPDATE public.finance_customer_credit_controls SET liability_account_id=liability_account_id'),/permission denied/);
  await assert.rejects(call(db,'customer_credit_preview',ids.entityA,payload),/permission denied/);
 }finally{await db.close();}
});

test('same-day credit dependencies reverse in order and the client rejects inconsistent balances',async()=>{
 const db=await database();try{
  const id=await invoice(db,'=UNTRUSTED-NUMBER','0.03');await receipt(db,id,'0.03');const a=await credit(db,id,'0.01'),b=await credit(db,id,'0.02');
  await assert.rejects(approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:a.creditId,date:'2026-01-04'}),/latest/);
  await approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:b.creditId,date:'2026-01-04'});await approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:a.creditId,date:'2026-01-04'});
  const r=await get(db);assert.equal(r.control.expected,'0.00');const before=await get(db,'2026-01-03');assert.equal(before.control.expected,'0.03');
  const corrupt=structuredClone(before);corrupt.credits[0].remaining='0.02';assert.throws(()=>parseCustomerAdjustments(corrupt),/reconcile/);
  const exportable=structuredClone(before);exportable.credits[0].reference='=SUM(A1:A2)';assert.match(customerAdjustmentCsv(exportable),/"'=SUM\(A1:A2\)"/);
 }finally{await db.close();}
});
test('credits cannot be backdated across receipts and closed-period posting stays atomic',async()=>{
 const db=await database();try{
  const id=await invoice(db,'DATES');await receipt(db,id,'50.00');await assert.rejects(credit(db,id,'10.00','2026-01-01'),/settlement history/);
  await db.exec("RESET ROLE;SELECT set_config('tapaano.accounting_write','trusted',false);UPDATE public.accounting_periods SET status='SOFT_CLOSED';SET ROLE authenticated");
  await assert.rejects(credit(db,id,'10.00'),/open|closed/i);assert.equal((await get(db)).credits.length,0);assert.equal((await ar(db)).outstanding,'50.00');
 }finally{await db.close();}
});
