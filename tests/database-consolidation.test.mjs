import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {parseConsolidation,consolidationCsv}=await loadTypescript('../../src/lib/groupFinance.ts');
const sub='40000000-0000-4000-8000-000000000090',eur='40000000-0000-4000-8000-000000000091';
const asset='30000000-0000-4000-8000-000000000090',capital='30000000-0000-4000-8000-000000000091',retained='30000000-0000-4000-8000-000000000092',cta='30000000-0000-4000-8000-000000000093',accrued='30000000-0000-4000-8000-000000000094',investment='30000000-0000-4000-8000-000000000095',dueFrom='30000000-0000-4000-8000-000000000096',dueTo='30000000-0000-4000-8000-000000000097';let seq=0;
const closeAttest={bank_sources_complete:true,usage_and_contracts_complete:true,unrecorded_liabilities_reviewed:true,asset_policies_reviewed:true,tax_and_opening_balances_reviewed:true};
const groupAttest={ownership_and_periods_reviewed:true,fx_policy_reviewed:true,eliminations_reviewed:true};
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.entities(id,org_id,name,currency) VALUES('${sub}','${ids.orgA}','US subsidiary','USD'),('${eur}','${ids.orgA}','EUR subsidiary','EUR');INSERT INTO public.accounts VALUES('${asset}','${ids.orgA}','1950','Other asset','asset',true),('${capital}','${ids.orgA}','3000','Capital','equity',true),('${retained}','${ids.orgA}','3100','Retained earnings','equity',true),('${cta}','${ids.orgA}','3900','Group CTA','equity',true),('${accrued}','${ids.orgA}','2450','Accrued liabilities','liability',true),('${investment}','${ids.orgA}','1960','Investment','asset',true),('${dueFrom}','${ids.orgA}','1360','Intercompany due from','asset',true),('${dueTo}','${ids.orgA}','2360','Intercompany due to','liability',true);SET ROLE authenticated`);for(const e of [ids.entityA,sub,eur])await call(db,'create_accounting_period',e,'2025-01-01','2025-12-31','group-year-'+e);return db;}
const post=(db,entity,date,debit,credit,amount)=>call(db,'post_manual_journal',entity,'GROUP-SOURCE-'+(++seq),date,'Synthetic source',[{account_id:debit,debit:amount,credit:'0.00'},{account_id:credit,debit:'0.00',credit:amount}],'group-source-'+seq);
async function request(db,kind,payload,entity=ids.entityA){await actor(db,ids.adminA);return call(db,'request_finance_action',entity,kind,payload,'Verified group accounting policy','group-request-'+(++seq));}
async function approve(db,kind,payload,entity=ids.entityA){const id=await request(db,kind,payload,entity);await actor(db,reviewer);const result=await call(db,'decide_finance_action',id,'APPROVE','Independent group accounting review');await actor(db,ids.adminA);return result;}
const group=async(db,member)=>approve(db,'GROUP_CREATE',{reference:'GROUP-'+(++seq),name:'Synthetic reporting group',currency:'USD',starts_on:'2025-01-01',member_ids:[ids.entityA,member],cta_account_id:cta,ownership_basis:'WHOLLY_OWNED'}).then(r=>r.groupId);
const close=(db,e)=>approve(db,'FISCAL_YEAR_CLOSE',{starts_on:'2025-01-01',ends_on:'2025-12-31',retained_account_id:retained,attestations:closeAttest},e);
const preview=async(db,g,rates=[])=>parseConsolidation(await call(db,'get_consolidation_report',g,'2025-01-01','2025-12-31',rates),{group:g,from:'2025-01-01',through:'2025-12-31'});
const final=(g,rates=[])=>({group_id:g,starts_on:'2025-01-01',ends_on:'2025-12-31',rates,attestations:groupAttest});
async function quotes(db,g,overrides={}){const r=await call(db,'get_consolidation_rate_requirements',g,'2025-01-01','2025-12-31');return r.quotes.map(q=>({...q,rate:overrides[q.kind+':'+q.date]??(q.kind==='HISTORICAL'?'1.10':q.kind==='AVERAGE'?(q.date==='2025-01-01'?'1.20':'1.25'):(q.date==='2025-12-31'?'1.30':'1.10'))}));}
test('consolidation eliminates owned intercompany balances and services while preserving both closed entity books',async()=>{
 const db=await database();try{
  await post(db,ids.entityA,'2025-01-01',asset,ids.revenueA,'300.00');await post(db,sub,'2025-01-02',ids.expenseA,accrued,'70.00');
  await approve(db,'INTERCOMPANY_CREATE',{reference:'GROUP-SERVICE',kind:'SERVICE',counterparty_entity_id:sub,date:'2025-01-03',currency:'USD',amount:'100.00',due_from_account_id:dueFrom,due_to_account_id:dueTo,seller_offset_account_id:ids.revenueA,buyer_offset_account_id:ids.expenseA});
  const g=await group(db,sub);let report=await preview(db,g);assert.equal(report.canFinalize,false);assert.equal(report.netIncome,'230.00');
  assert.equal(report.rows.find(r=>r.accountId===ids.revenueA).sourceIncome,'-400.00');assert.equal(report.rows.find(r=>r.accountId===ids.revenueA).automaticIncome,'100.00');assert.equal(report.rows.find(r=>r.accountId===ids.expenseA).income,'70.00');
  assert.match(consolidationCsv(report),/230.00/);const altered=structuredClone(report);altered.rows.find(r=>r.accountId===ids.revenueA).sourceIncome='-401.00';assert.throws(()=>parseConsolidation(altered,{group:g,from:'2025-01-01',through:'2025-12-31'}),/reconcile/);
  for(const a of [dueFrom,dueTo])assert.equal(report.rows.find(r=>r.accountId===a).closing,'0.00');
  const parentClose=await close(db,ids.entityA);await close(db,sub);report=await preview(db,g);assert.equal(report.canFinalize,true);assert.equal(report.netIncome,'230.00');assert.equal(report.rows.find(r=>r.accountId===retained).closing,'-230.00');
  const result=await approve(db,'GROUP_CONSOLIDATE',final(g));let saved=await call(db,'get_approved_consolidation',result.consolidationId);assert.equal(saved.active,true);assert.equal(saved.sourceChanged,false);assert.equal(saved.comparisonAvailable,true);
  await assert.rejects(approve(db,'FISCAL_YEAR_REOPEN',{close_id:parentClose.closeId}),/consolidated report/);
  await approve(db,'GROUP_REOPEN',{consolidation_id:result.consolidationId});await approve(db,'FISCAL_YEAR_REOPEN',{close_id:parentClose.closeId});saved=await call(db,'get_approved_consolidation',result.consolidationId);assert.equal(saved.active,false);assert.equal(saved.sourceChanged,true);assert.equal(saved.report.netIncome,'230.00');
  await actor(db,ids.adminB);await assert.rejects(preview(db,g),/unavailable/);await assert.rejects(call(db,'get_approved_consolidation',result.consolidationId),/unavailable/);
 }finally{await db.close();}
});
test('functional-currency translation rolls average-rate earnings into retained earnings and preserves approved manual eliminations',async()=>{
 const db=await database();try{
  const source=await post(db,ids.entityA,'2025-01-01',investment,capital,'1100.00');const sourceSub=await post(db,eur,'2025-01-01',asset,capital,'1000.00');
  await post(db,eur,'2025-01-10',asset,ids.revenueA,'100.00');await post(db,eur,'2025-02-10',ids.expenseA,asset,'20.00');
  const g=await group(db,eur),rates=await quotes(db,g);await assert.rejects(preview(db,g,[]),/required exchange-rate/);
  let r=await preview(db,g,rates);assert.equal(r.netIncome,'95.00');assert.equal(r.translationAdjustment,'-209.00');assert.equal(r.rows.find(x=>x.accountId===asset).closing,'1404.00');
  const adjustment={group_id:g,date:'2025-12-31',reference:'Accepted investment-equity elimination',lines:[{account_id:capital,debit:'1100.00',credit:'0.00'},{account_id:investment,debit:'0.00',credit:'1100.00'}],source_journals:[source,sourceSub]};
  const adj=await approve(db,'GROUP_ADJUSTMENT',adjustment);await close(db,ids.entityA);await close(db,eur);
  r=await preview(db,g,rates);assert.equal(r.canFinalize,true);assert.equal(r.netIncome,'95.00');assert.equal(r.rows.find(x=>x.accountId===retained).closing,'-95.00');assert.equal(r.rows.find(x=>x.accountId===capital).closing,'-1100.00');assert.equal(r.rows.find(x=>x.accountId===investment).closing,'0.00');
  const proposal=await request(db,'GROUP_CONSOLIDATE',final(g,rates));await approve(db,'GROUP_ADJUSTMENT_REVERSE',{adjustment_id:adj.adjustmentId,date:'2025-12-31'});await actor(db,reviewer);await assert.rejects(call(db,'decide_finance_action',proposal,'APPROVE','Old consolidation'),/source changed/);await actor(db,ids.adminA);
  assert.equal((await preview(db,g,rates)).rows.find(x=>x.accountId===investment).closing,'1100.00');
 }finally{await db.close();}
});
test('a zero local profit and absent fiscal journal still carry the translated earnings into retained earnings',async()=>{
 const db=await database();try{
  await post(db,eur,'2025-01-01',asset,capital,'1000.00');await post(db,eur,'2025-01-02',asset,ids.revenueA,'100.00');await post(db,eur,'2025-02-02',ids.revenueA,asset,'100.00');
  const g=await group(db,eur),rates=await quotes(db,g,{'AVERAGE:2025-02-01':'1.40'});assert.equal((await preview(db,g,rates)).netIncome,'-20.00');
  await close(db,ids.entityA);const closed=await close(db,eur);assert.equal(closed.journalId,null);
  const r=await preview(db,g,rates);assert.equal(r.rows.find(x=>x.accountId===ids.revenueA).closing,'0.00');assert.equal(r.rows.find(x=>x.accountId===retained).closing,'20.00');assert.equal(r.translationAdjustment,'-220.00');assert.equal(r.netIncome,'-20.00');
  await approve(db,'GROUP_CONSOLIDATE',final(g,rates));
 }finally{await db.close();}
});
test('group cash flow eliminates bilateral funding and distinguishes unclassified cash, currency effects and exact category rounding',async()=>{
 const db=await database();try{
  for(const e of [ids.entityA,sub,eur])await call(db,'create_cash_register',e,ids.cashA,'Statement bank '+e);
  await post(db,ids.entityA,'2025-01-01',ids.cashA,capital,'1000.00');await post(db,eur,'2025-01-01',ids.cashA,capital,'1000.00');await post(db,eur,'2025-01-10',ids.cashA,ids.revenueA,'100.00');await post(db,eur,'2025-02-10',ids.expenseA,ids.cashA,'20.00');
  for(let i=0;i<3;i++)await post(db,eur,'2025-02-11',ids.expenseA,ids.cashA,'0.01');
  await approve(db,'INTERCOMPANY_CREATE',{reference:'GROUP-CASH-FUNDING',kind:'FUNDING',counterparty_entity_id:sub,date:'2025-03-01',currency:'USD',amount:'50.00',due_from_account_id:dueFrom,due_to_account_id:dueTo,seller_offset_account_id:ids.cashA,buyer_offset_account_id:ids.cashA});
  const g=(await approve(db,'GROUP_CREATE',{reference:'CASH-GROUP',name:'Cash statement group',currency:'USD',starts_on:'2025-01-01',member_ids:[ids.entityA,sub,eur],cta_account_id:cta,ownership_basis:'WHOLLY_OWNED'})).groupId;
  const mapping={[ids.cashA]:'CASH',[capital]:'CAPITAL',[retained]:'RETAINED_EARNINGS',[cta]:'OTHER_EQUITY',[ids.revenueA]:'REVENUE',[ids.expenseA]:'OPERATING_EXPENSES',[dueFrom]:'OTHER_CURRENT_ASSETS',[dueTo]:'CURRENT_LIABILITIES'};
  const policies={};for(const e of [ids.entityA,sub,eur])policies[e]=(await approve(db,'STATEMENT_POLICY',{group_id:null,expected_version:0,cash_accounts:[ids.cashA],mappings:Object.entries(mapping).map(([account_id,section])=>({account_id,section}))},e)).policyId;
  await approve(db,'STATEMENT_POLICY',{group_id:g,expected_version:0,cash_accounts:[ids.cashA],mappings:Object.entries(mapping).map(([account_id,section])=>({account_id,section}))});
  const rates=await quotes(db,g);let r=await preview(db,g,rates);assert.equal(r.presentationComplete,false);assert.equal(r.cashFlow.exchangeEffect,'108.99');assert.equal(r.cashFlow.closingCash,'2403.96');
  for(const e of [ids.entityA,sub,eur]){const cash=await call(db,'get_entity_cash_flow',e,'2025-01-01','2025-12-31');if(cash.sources.length)await approve(db,'CASH_FLOW_CLASSIFY',{policy_id:policies[e],items:cash.sources.map(s=>({line_id:s.lineId,expected_version:0,allocations:[{category:s.date==='2025-03-01'?(s.amount.startsWith('-')?'INVESTMENTS_LOANS':'BORROWINGS'):s.amount==='1000.00'?'EQUITY':s.amount==='100.00'?'CUSTOMER_RECEIPTS':'SUPPLIER_EMPLOYEE_PAYMENTS',amount:s.amount.replace('-','')}]}))},e);}
  r=await preview(db,g,rates);assert.equal(r.presentationComplete,true);assert.equal(r.cashFlow.exchangeEffect,'108.99');assert.equal(r.cashFlow.unclassifiedMovement,'0.00');assert.equal(r.cashFlow.roundingDifference,'0.01');assert.equal(r.cashFlow.classifiedMovement,'2294.96');assert.equal(r.cashFlow.categories.find(c=>c.category==='INVESTMENTS_LOANS').net,'0.00');assert.equal(r.cashFlow.categories.find(c=>c.category==='BORROWINGS').net,'0.00');assert.equal(r.cashFlow.sources.filter(s=>s.eliminated).length,2);assert.equal(r.statements.netIncome,'94.97');
  for(const e of [ids.entityA,sub,eur]){const native=await call(db,'get_entity_cash_flow',e,'2025-01-01','2025-12-31');const register=(await db.query('SELECT id FROM public.cash_registers WHERE entity_id=$1',[e])).rows[0].id;const statement=await call(db,'import_cash_statement',register,{reference:'Complete bank '+e,starts_on:'2025-01-01',ends_on:'2025-12-31',opening:'0.00',closing:native.closingCash,lines:native.sources.map(s=>({external_id:s.lineId,booked_on:s.date,amount:s.amount,reference:s.lineId,description:'Synthetic bank movement'}))},'group-statement-'+e);
   const bank=await call(db,'get_cash_reconciliation',statement);for(const line of bank.lines){const current=await call(db,'get_cash_reconciliation',statement);const source=native.sources.find(s=>s.lineId===line.reference);await call(db,'match_cash_statement',statement,[line.id],[source.lineId],'Exact source evidence',current.revision);}const review=await call(db,'request_cash_review',statement,'CLOSE','Reviewed bank evidence',(await call(db,'get_cash_reconciliation',statement)).revision);await actor(db,reviewer);await call(db,'decide_cash_review',review,'APPROVE','Independent bank completeness');await actor(db,ids.adminA);await close(db,e);
  }
  r=await preview(db,g,rates);assert.equal(r.canFinalize,true);assert.equal(r.statements.netIncome,'94.97');const finalReport=await approve(db,'GROUP_CONSOLIDATE',final(g,rates));assert.equal((await call(db,'get_approved_consolidation',finalReport.consolidationId)).sourceChanged,false);
  const native=await call(db,'get_entity_cash_flow',eur,'2025-01-01','2025-12-31'),line=native.sources[0];await assert.rejects(approve(db,'CASH_FLOW_CLASSIFY',{policy_id:policies[eur],items:[{line_id:line.lineId,expected_version:1,allocations:[{category:'OTHER_FINANCING',amount:line.amount}]}]},eur),/consolidated cutoff/);
  await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await db.query('SELECT public.validate_consolidation_graph($1)',[finalReport.consolidationId]);
 }finally{await db.close();}
});
