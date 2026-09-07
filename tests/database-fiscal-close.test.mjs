import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {deriveLedgerStatements}=await loadTypescript('../../src/lib/financeReports.ts');
const retained='30000000-0000-4000-8000-000000000060',accrued='30000000-0000-4000-8000-000000000061';let seq=0;
const attestations={bank_sources_complete:true,usage_and_contracts_complete:true,unrecorded_liabilities_reviewed:true,asset_policies_reviewed:true,tax_and_opening_balances_reviewed:true};
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${retained}','${ids.orgA}','3100','Retained earnings','equity',true),('${accrued}','${ids.orgA}','2400','Accrued expenses','liability',true);SET ROLE authenticated`);const period=await call(db,'create_accounting_period',ids.entityA,'2025-01-01','2025-12-31','prior-year');return {db,period};}
async function approve(db,kind,payload){await actor(db,ids.adminA);const id=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic close source evidence','close-'+(++seq));await actor(db,reviewer);const r=await call(db,'decide_finance_action',id,'APPROVE','Independent fiscal review');await actor(db,ids.adminA);return r;}
const posting=(db,key,date,debit,credit,amount)=>call(db,'post_manual_journal',ids.entityA,key,date,'Synthetic fiscal activity',[{account_id:debit,debit:amount,credit:'0.00'},{account_id:credit,debit:'0.00',credit:amount}],key);
const check=db=>call(db,'get_finance_close_check',ids.entityA,'2025-01-01','2025-12-31');
const closePayload={starts_on:'2025-01-01',ends_on:'2025-12-31',retained_account_id:retained,attestations};
async function reconcile(db){
 const register=await call(db,'create_cash_register',ids.entityA,ids.cashA,'Fiscal acceptance bank');
 const statement=await call(db,'import_cash_statement',register,{reference:'Fiscal 2025 bank',starts_on:'2025-01-01',ends_on:'2025-12-31',opening:'0.00',closing:'80.00',lines:[{external_id:'bank-income',booked_on:'2025-01-01',description:'Customer receipt',reference:'FY-INCOME',amount:'100.00'},{external_id:'bank-expense',booked_on:'2025-01-02',description:'Supplier cost',reference:'FY-EXPENSE',amount:'-20.00'}]},'fiscal-bank');
 let report=await call(db,'get_cash_reconciliation',statement);for(const line of report.lines){report=await call(db,'get_cash_reconciliation',statement);await call(db,'match_cash_statement',statement,[line.id],[report.bookLines.find(l=>l.amount===line.amount).id],'Verified fiscal source',report.revision);}
 const request=await call(db,'request_cash_review',statement,'CLOSE','Fiscal bank complete',(await call(db,'get_cash_reconciliation',statement)).revision);await actor(db,reviewer);await call(db,'decide_cash_review',request,'APPROVE','Verified bank source');await actor(db,ids.adminA);
}
test('fiscal close requires reconciled sources, transfers profit to retained earnings and prevents backdated bypasses',async()=>{
 const {db,period}=await database();try{
  await posting(db,'FY-INCOME','2025-01-01',ids.cashA,ids.revenueA,'100.00');await posting(db,'FY-EXPENSE','2025-01-02',ids.expenseA,ids.cashA,'20.00');
  let c=await check(db);assert.equal(c.canClose,false);assert.equal(c.unregisteredCashAccounts,1);await assert.rejects(approve(db,'FISCAL_YEAR_CLOSE',closePayload),/unresolved/);
  await reconcile(db);c=await check(db);assert.equal(c.canClose,true);
  const result=await approve(db,'FISCAL_YEAR_CLOSE',closePayload);assert.ok(result.journalId);
  const trial=await call(db,'get_entity_trial_balance',ids.entityA,'2025-01-01','2025-12-31');assert.equal(trial.rows.find(a=>a.accountId===retained).closingCredit,'80.00');for(const id of [ids.revenueA,ids.expenseA]){const row=trial.rows.find(a=>a.accountId===id);assert.equal(row.closingDebit,'0.00');assert.equal(row.closingCredit,'0.00');}
  assert.equal(deriveLedgerStatements(trial).netIncome,'80.00');assert.equal(deriveLedgerStatements(trial).unclosedEarnings,'0.00');
  assert.equal((await db.query('SELECT status FROM public.accounting_periods WHERE id=$1',[period])).rows[0].status,'SOFT_CLOSED');
  await assert.rejects(call(db,'change_accounting_period',period,2,'OPEN','Direct reopen','direct-reopen'),/independent finance review/);
  await approve(db,'PERIOD_REVIEW',{period_id:period,expected_version:2,status:'OPEN',attestations:{}});
  await assert.rejects(posting(db,'BACKDATED','2025-12-31',ids.expenseA,accrued,'1.00'),/reopen the fiscal close/);
  await approve(db,'FISCAL_YEAR_REOPEN',{close_id:result.closeId});await posting(db,'ADJUSTMENT','2025-12-31',ids.expenseA,accrued,'1.00');
  const again=await approve(db,'FISCAL_YEAR_CLOSE',closePayload);assert.notEqual(again.closeId,result.closeId);
  assert.equal((await call(db,'get_entity_trial_balance',ids.entityA,'2025-01-01','2025-12-31')).rows.find(a=>a.accountId===retained).closingCredit,'79.00');
  assert.equal(deriveLedgerStatements(await call(db,'get_entity_trial_balance',ids.entityA,'2025-01-01','2025-12-31')).netIncome,'79.00');
  await actor(db,ids.adminB);await assert.rejects(check(db),/unavailable/);assert.deepEqual((await db.query('SELECT id FROM public.finance_year_closes')).rows,[]);
 }finally{await db.close();}
});
test('fiscal snapshots reject changed earnings and permanently closed years cannot be reopened',async()=>{
 const {db,period}=await database();try{
  await posting(db,'NONCASH-INCOME','2025-01-01',accrued,ids.revenueA,'100.00');assert.equal((await check(db)).canClose,true);
  const request=await call(db,'request_finance_action',ids.entityA,'FISCAL_YEAR_CLOSE',closePayload,'Original closing proposal','stale-fiscal');
  await posting(db,'AFTER-PROPOSAL','2025-12-31',ids.expenseA,accrued,'10.00');await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',request,'APPROVE','Old numbers'),/source changed/);
  await actor(db,ids.adminA);const result=await approve(db,'FISCAL_YEAR_CLOSE',closePayload);
  await approve(db,'PERIOD_REVIEW',{period_id:period,expected_version:2,status:'HARD_CLOSED',attestations});
  await assert.rejects(approve(db,'FISCAL_YEAR_REOPEN',{close_id:result.closeId}),/hard-closed/);
  assert.equal((await db.query('SELECT active FROM public.finance_year_closes WHERE id=$1',[result.closeId])).rows[0].active,true);
 }finally{await db.close();}
});
