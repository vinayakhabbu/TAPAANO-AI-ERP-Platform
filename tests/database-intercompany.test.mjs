import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
const buyer='40000000-0000-4000-8000-000000000080',foreign='40000000-0000-4000-8000-000000000081',dueFrom='30000000-0000-4000-8000-000000000080',dueTo='30000000-0000-4000-8000-000000000081';let seq=0;
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.entities(id,org_id,name,currency) VALUES('${buyer}','${ids.orgA}','Subsidiary','USD'),('${foreign}','${ids.orgA}','Foreign subsidiary','EUR');INSERT INTO public.accounts VALUES('${dueFrom}','${ids.orgA}','1350','Intercompany receivable','asset',true),('${dueTo}','${ids.orgA}','2350','Intercompany payable','liability',true);SET ROLE authenticated`);await call(db,'create_accounting_period',buyer,'2026-01-01','2026-12-31','buyer-year');for(const entity of [buyer,ids.entityA])await call(db,'create_cash_register',entity,ids.cashA,'Intercompany bank');return db;}
async function request(db,kind,payload,entity=ids.entityA){await actor(db,ids.adminA);return call(db,'request_finance_action',entity,kind,payload,'Verified bilateral source','intercompany-'+(++seq));}
async function approve(db,kind,payload,entity=ids.entityA){const id=await request(db,kind,payload,entity);await actor(db,reviewer);const result=await call(db,'decide_finance_action',id,'APPROVE','Independent bilateral review');await actor(db,ids.adminA);return result;}
const terms=(kind='SERVICE',amount='100.00')=>({reference:'IC-'+(++seq),kind,counterparty_entity_id:buyer,date:'2026-01-01',currency:'USD',amount,due_from_account_id:dueFrom,due_to_account_id:dueTo,seller_offset_account_id:kind==='SERVICE'?ids.revenueA:ids.cashA,buyer_offset_account_id:kind==='SERVICE'?ids.expenseA:ids.cashA});
const settlement=(id,amount,date='2026-01-02')=>({transfer_id:id,date,amount,seller_cash_account_id:ids.cashA,buyer_cash_account_id:ids.cashA});
const report=(db,entity=ids.entityA,date='2026-01-31')=>call(db,'get_intercompany_report',entity,date);
test('intercompany service posts both approved books and preserves dated partial settlement and correction history',async()=>{
 const db=await database();try{
  for(const entity of [ids.entityA,buyer])await approve(db,'APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0},entity);
  const t=await approve(db,'INTERCOMPANY_CREATE',terms());assert.ok(t.sellerJournal&&t.buyerJournal);
  for(const entity of [ids.entityA,buyer])assert.ok((await report(db,entity)).controls.every(c=>c.variance==='0.00'));
  const first=await approve(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'40.00'));
  assert.equal((await report(db)).transfers[0].outstanding,'60.00');await assert.rejects(approve(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'60.01')),/capacity/);
  await assert.rejects(approve(db,'INTERCOMPANY_REVERSE',{transfer_id:t.transferId,date:'2026-01-03'}),/correct all settlements/);
  await assert.rejects(approve(db,'JOURNAL_REVERSAL',{source_id:t.sellerJournal,date:'2026-01-03',reference:'One-sided bypass'}),/bilateral/);
  await approve(db,'INTERCOMPANY_UNSETTLE',{settlement_id:first.settlementId,date:'2026-01-03'});
  assert.equal((await report(db,ids.entityA,'2026-01-02')).transfers[0].outstanding,'60.00');assert.equal((await report(db)).transfers[0].outstanding,'100.00');
  await approve(db,'INTERCOMPANY_REVERSE',{transfer_id:t.transferId,date:'2026-01-04'});
  for(const entity of [ids.entityA,buyer]){const r=await report(db,entity);assert.equal(r.transfers[0].outstanding,'0.00');assert.ok(r.controls.every(c=>c.ledger==='0.00'&&c.variance==='0.00'));}
  await actor(db,ids.adminB);await assert.rejects(report(db),/unavailable/);assert.deepEqual((await db.query('SELECT id FROM public.finance_intercompany')).rows,[]);
 }finally{await db.close();}
});
test('funding, future-dated capacity reservations and stale approvals cannot produce a one-sided or excessive balance',async()=>{
 const db=await database();try{
  const t=await approve(db,'INTERCOMPANY_CREATE',terms('FUNDING','200.00'));
  assert.equal((await call(db,'get_entity_trial_balance',ids.entityA,'2026-01-01','2026-01-31')).rows.find(r=>r.accountId===ids.cashA).closingCredit,'200.00');
  assert.equal((await call(db,'get_entity_trial_balance',buyer,'2026-01-01','2026-01-31')).rows.find(r=>r.accountId===ids.cashA).closingDebit,'200.00');
  await approve(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'150.00','2026-01-20'));
  await assert.rejects(approve(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'50.01','2026-01-02')),/capacity/);
  const stale=await request(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'20.00','2026-01-03'));await approve(db,'INTERCOMPANY_SETTLE',settlement(t.transferId,'10.00','2026-01-02'));
  await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',stale,'APPROVE','Outdated capacity evidence'),/source changed/);await actor(db,ids.adminA);
  await assert.rejects(approve(db,'INTERCOMPANY_CREATE',{...terms(),counterparty_entity_id:foreign}),/same functional currency/);
  await assert.rejects(approve(db,'INTERCOMPANY_CREATE',{...terms(),due_from_account_id:ids.arA}),/dedicated/);
  const pending=await request(db,'INTERCOMPANY_CREATE',terms());const period=(await db.query('SELECT id,version FROM public.accounting_periods WHERE entity_id=$1',[buyer])).rows[0];await call(db,'change_accounting_period',period.id,period.version,'SOFT_CLOSED','Buyer close','buyer-close');
  const before=(await db.query('SELECT count(*)::int AS n FROM public.journal_entries')).rows[0].n;await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',pending,'APPROVE','Closed counterparty'),/both intercompany accounting periods/);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.journal_entries')).rows[0].n,before);
 }finally{await db.close();}
});
