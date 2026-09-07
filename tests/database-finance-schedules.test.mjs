import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
const asset='30000000-0000-4000-8000-000000000050',accumulated='30000000-0000-4000-8000-000000000051';let seq=0;
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${asset}','${ids.orgA}','1600','Capitalized cost','asset',true),('${accumulated}','${ids.orgA}','1690','Accumulated depreciation','asset',true);SET ROLE authenticated`);return db;}
async function approve(db,kind,payload){await actor(db,ids.adminA);const request=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic financial evidence','schedule-'+(++seq));await actor(db,reviewer);const result=await call(db,'decide_finance_action',request,'APPROVE','Independent schedule review');await actor(db,ids.adminA);return result;}
async function acquire(db,amount,key){const journal=await call(db,'post_manual_journal',ids.entityA,key,'2026-01-01','Verified acquisition',[{account_id:asset,debit:amount,credit:'0.00'},{account_id:ids.cashA,debit:'0.00',credit:amount}],key);return (await db.query('SELECT id FROM public.journal_lines WHERE journal_entry_id=$1 AND account_id=$2',[journal,asset])).rows[0].id;}
const terms=(reference,line,kind='PREPAID')=>({reference,kind,starts_on:'2026-01-01',ends_on:'2026-12-31',source_line_id:line,salvage:'0.00',expense_account_id:ids.expenseA,...(kind==='FIXED_ASSET'?{accumulated_account_id:accumulated}:{})});
const report=(db,id,date='2026-09-07')=>call(db,'get_finance_schedule',id,date);
const run=(db,id,date)=>approve(db,'SCHEDULE_RUN',{schedule_id:id,date});
const balance=(db,account,date)=>db.query("SELECT round(coalesce(sum(l.debit-l.credit),0),2)::text AS value FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=$1 AND j.entry_date<=$2",[account,date]).then(r=>r.rows[0].value);
test('prepaid schedules link existing cost and post exact cumulative expense without duplicating acquisition',async()=>{
 const db=await database();try{
  const line=await acquire(db,'36500.00','PREPAID-ACQUISITION');const id=(await approve(db,'SCHEDULE_CREATE',terms('PREPAID',line))).scheduleId;
  await assert.rejects(approve(db,'SCHEDULE_CREATE',terms('DUPLICATE-ASSET',line)),/unassigned/);
  assert.equal(await balance(db,asset,'2026-01-01'),'36500.00');await run(db,id,'2026-01-31');await run(db,id,'2026-02-28');
  const r=await report(db,id,'2026-02-28');assert.equal(r.expensed,'5900.00');assert.equal(r.carryingValue,'30600.00');assert.equal(r.projection.at(-1).cumulativeExpense,'36500.00');
  assert.equal(await balance(db,asset,'2026-02-28'),'30600.00');await assert.rejects(run(db,id,'2026-02-28'),/no additional/);
  await assert.rejects(approve(db,'SCHEDULE_CANCEL',{schedule_id:id}),/postings/);
  const source=(await db.query('SELECT journal_entry_id FROM public.journal_lines WHERE id=$1',[line])).rows[0].journal_entry_id;
  await assert.rejects(call(db,'reverse_posted_journal',source,'2026-03-01','Unsafe source reversal','unsafe'),/registered acquisition/);
 }finally{await db.close();}
});
test('fixed asset expense, disposal and original-date restoration retain cost, depreciation and gain/loss evidence',async()=>{
 const db=await database();try{
  const line=await acquire(db,'36500.00','FIXED-ACQUISITION');const id=(await approve(db,'SCHEDULE_CREATE',terms('FIXED',line,'FIXED_ASSET'))).scheduleId;
  await run(db,id,'2026-01-31');assert.equal(await balance(db,asset,'2026-01-31'),'36500.00');assert.equal(await balance(db,accumulated,'2026-01-31'),'-3100.00');
  await approve(db,'ASSET_DISPOSE',{schedule_id:id,date:'2026-02-28',proceeds:'30000.00',proceeds_account_id:ids.cashA,gain_account_id:ids.revenueA,loss_account_id:ids.expenseA});
  let r=await report(db,id,'2026-02-28');assert.equal(r.disposedAsOf,true);assert.equal(r.carryingValue,'0.00');assert.equal(await balance(db,asset,'2026-02-28'),'0.00');assert.equal(await balance(db,accumulated,'2026-02-28'),'0.00');assert.equal(await balance(db,ids.expenseA,'2026-02-28'),'6500.00');
  await assert.rejects(run(db,id,'2026-03-31'),/not active/);
  await approve(db,'ASSET_RESTORE',{schedule_id:id,date:'2026-02-28'});r=await report(db,id,'2026-02-28');assert.equal(r.carryingValue,'30600.00');assert.equal(r.state,'ACTIVE');assert.equal(await balance(db,asset,'2026-02-28'),'36500.00');assert.equal(await balance(db,accumulated,'2026-02-28'),'-5900.00');
 }finally{await db.close();}
});
test('latest schedule corrections preserve dated history and recompute only the remaining earned expense',async()=>{
 const db=await database();try{
  const id=(await approve(db,'SCHEDULE_CREATE',terms('CORRECT',await acquire(db,'36500.00','CORRECTION-ACQUISITION')))).scheduleId;
  await run(db,id,'2026-01-31');let r=await report(db,id);const entry=r.entries[0];
  await assert.rejects(call(db,'reverse_posted_journal',entry.journalId,'2026-02-01','Direct reversal','direct-schedule'),/linked independent/);
  await approve(db,'SCHEDULE_CORRECT',{schedule_id:id,entry_id:entry.id,date:'2026-02-01'});assert.equal((await report(db,id,'2026-01-31')).expensed,'3100.00');assert.equal((await report(db,id,'2026-02-01')).expensed,'0.00');
  await run(db,id,'2026-02-28');r=await report(db,id,'2026-02-28');assert.equal(r.expensed,'5900.00');assert.equal(r.entries.at(-1).amount,'5900.00');
 }finally{await db.close();}
});
test('recurring journals and accrual reversals run only due occurrences and retry through the approval ledger',async()=>{
 const db=await database();try{
  const lines=[{account_id:ids.expenseA,debit:'1200.00',credit:'0.00'},{account_id:ids.apA,debit:'0.00',credit:'1200.00'}];
  const id=(await approve(db,'SCHEDULE_CREATE',{reference:'RECURRING',kind:'RECURRING',starts_on:'2026-01-31',ends_on:'2026-03-31',cycle_months:1,lines})).scheduleId;
  await approve(db,'APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0});
  await run(db,id,'2026-03-31');let r=await report(db,id);assert.deepEqual(r.entries.map(e=>e.date),['2026-01-31','2026-02-28','2026-03-31']);assert.equal(await balance(db,ids.expenseA,'2026-03-31'),'3600.00');
  await assert.rejects(run(db,id,'2026-03-31'),/no pending/);await approve(db,'SCHEDULE_CANCEL',{schedule_id:id});
  const accrual=(await approve(db,'SCHEDULE_CREATE',{reference:'ACCRUAL',kind:'ACCRUAL',starts_on:'2026-04-30',ends_on:'2026-05-01',lines})).scheduleId;
  await run(db,accrual,'2026-04-30');await assert.rejects(approve(db,'SCHEDULE_CANCEL',{schedule_id:accrual}),/outstanding accrual/);
  await run(db,accrual,'2026-05-01');r=await report(db,accrual);assert.deepEqual(r.entries.map(e=>e.kind),['ACCRUAL','REVERSAL']);assert.equal(await balance(db,ids.expenseA,'2026-05-01'),'3600.00');
  await actor(db,ids.adminB);await assert.rejects(report(db,id),/unavailable/);assert.deepEqual((await db.query('SELECT id FROM public.finance_schedules')).rows,[]);
 }finally{await db.close();}
});
