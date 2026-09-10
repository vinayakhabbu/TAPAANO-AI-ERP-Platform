import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {financeDatabase,ids,reviewer,actor,call,journal} from './helpers/finance-workflows.mjs';
let sequence=0;
async function approve(db,kind,payload){await actor(db,ids.adminA);const id=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic verified bank consent','bank-feed-'+(++sequence));await actor(db,reviewer);const result=await call(db,'decide_finance_action',id,'APPROVE','Independent bank connection review');await actor(db,ids.adminA);return result;}
async function database(){const db=await financeDatabase();const register=await call(db,'create_cash_register',ids.entityA,ids.cashA,'Connected bank');const feed=randomUUID();const config={id:feed,register_id:register,label:'Bank feed fixture',environment:'SANDBOX',item_id:'item_synthetic',account_id:'account_synthetic',coverage_start:'2026-01-01',enabled:true,expected_version:0};await approve(db,'BANK_FEED_CONFIG',config);return {db,feed,register,config};}
const source=(externalId,amount='100.00',extra={})=>({externalId,accountId:'account_synthetic',currency:'USD',date:'2026-01-02',description:'Synthetic bank movement',amount,state:'POSTED',pendingId:null,...extra});
const page=(nextCursor,extra={})=>({requestId:'plaid-request-'+nextCursor,nextCursor,hasMore:false,updateStatus:'HISTORICAL_UPDATE_COMPLETE',added:[],modified:[],removed:[],...extra});
async function service(db,fn,...args){await db.exec('RESET ROLE;SET ROLE service_role');try{return await call(db,fn,...args);}finally{await db.exec('RESET ROLE;SET ROLE authenticated');}}
const claim=(db,feed)=>service(db,'claim_bank_feed_sync',feed);
const append=(db,c,p)=>service(db,'append_bank_feed_page',c.runId,c.leaseToken,c.pageNumber,c.cursor,p,'a'.repeat(64));
const report=(db,feed)=>call(db,'get_bank_feed_report',feed,'2026-01-01','2026-01-31',null,100);
async function ready(db,feed){await db.exec("RESET ROLE;SELECT set_config('tapaano.accounting_write','trusted',false)");await db.query("UPDATE public.finance_bank_sync_state SET next_attempt_at=now()-INTERVAL '1 second' WHERE feed_id=$1",[feed]);await db.exec('SET ROLE authenticated');}
async function sync(db,feed,p){await ready(db,feed);const c=await claim(db,feed);assert.ok(c);await append(db,c,p);return c;}

test('complete bank batches atomically publish exact transactions and retry the final page without duplicates',async()=>{
 const {db,feed}=await database();try{
  const first=await claim(db,feed);assert.ok(first);assert.equal(await claim(db,feed),null);
  const p1=page('cursor-1',{hasMore:true,added:[source('paid'),source('pending','-5.00',{state:'PENDING'})]});await append(db,first,p1);
  let r=await report(db,feed);assert.equal(r.generation,0);assert.equal(r.transactions.length,0);assert.equal(r.syncInProgress,true);
  const second={...first,cursor:'cursor-1',pageNumber:1};const p2=page('cursor-2',{added:[source('fee','-3.01')]});assert.equal((await append(db,second,p2)).committed,true);assert.equal((await append(db,second,p2)).committed,true);
  r=await report(db,feed);assert.equal(r.generation,1);assert.equal(r.postedNet,'96.99');assert.equal(r.postedCount,2);assert.equal(r.transactions.length,3);
  await assert.rejects(append(db,second,page('forged')),/idempotency conflict/);
  assert.ok(r.transactions.every(t=>t.revision===1));
 }finally{await db.close();}
});
test('paused bank pagination resumes, but mutations and expired leases restart at the original committed cursor',async()=>{
 const {db,feed}=await database();try{
  const c=await claim(db,feed);await append(db,c,page('partial',{hasMore:true,added:[source('uncommitted')]}));
  await service(db,'release_bank_feed_sync',c.runId,c.leaseToken,null);const resume=await claim(db,feed);assert.equal(resume.runId,c.runId);assert.equal(resume.cursor,'partial');assert.equal(resume.pageNumber,1);
  await service(db,'release_bank_feed_sync',resume.runId,resume.leaseToken,'CURSOR_MUTATION');await ready(db,feed);const restart=await claim(db,feed);assert.notEqual(restart.runId,c.runId);assert.equal(restart.cursor,null);assert.equal(restart.pageNumber,0);
  await append(db,restart,page('committed',{added:[source('actual')]}));assert.deepEqual((await report(db,feed)).transactions.map(t=>t.source.externalId),['actual']);
  await ready(db,feed);const lost=await claim(db,feed);await append(db,lost,page('lost-page',{hasMore:true,added:[source('lost')]}));
  await db.exec("RESET ROLE;SELECT set_config('tapaano.accounting_write','trusted',false)");await db.query("UPDATE public.finance_bank_sync_state SET lease_until=now()-INTERVAL '1 second' WHERE feed_id=$1",[feed]);await db.exec('SET ROLE authenticated');
  const recovered=await claim(db,feed);assert.notEqual(recovered.runId,lost.runId);assert.equal(recovered.cursor,'committed');assert.equal(recovered.pageNumber,0);
  await assert.rejects(append(db,{...lost,pageNumber:1,cursor:'lost-page'},page('bad')),/lease/);
 }finally{await db.close();}
});
test('bank account identity, page chains, precision, tenant isolation and reviewed disablement are enforced',async()=>{
 const {db,feed,config}=await database();try{
  const c=await claim(db,feed);
  for(const p of [page('bad',{added:[source('other','100.00',{accountId:'foreign'})]}),page('bad',{added:[source('fraction','1.001')]})]){
   await assert.rejects(append(db,c,p),/account|decimal/);
  }
  await assert.rejects(append(db,{...c,pageNumber:2},page('bad')),/cursor/);
  await actor(db,ids.adminB);await assert.rejects(report(db,feed),/unavailable/);assert.deepEqual((await db.query('SELECT * FROM public.finance_bank_feeds')).rows,[]);
  await actor(db,ids.adminA);await assert.rejects(call(db,'claim_bank_feed_sync',feed),/permission denied/);await assert.rejects(db.exec('SELECT * FROM public.finance_bank_sync_state'),/permission denied/);await assert.rejects(db.exec('UPDATE public.finance_bank_feeds SET enabled=false'),/permission denied/);
  await approve(db,'BANK_FEED_CONFIG',{...config,enabled:false,expected_version:1});await assert.rejects(append(db,c,page('disabled')),/configuration/);
  await service(db,'release_bank_feed_sync',c.runId,c.leaseToken,'CONFIGURATION');assert.equal(await claim(db,feed),null);
 }finally{await db.close();}
});
test('unavailable initial history and incomplete refreshes cannot satisfy a bank close',async()=>{
 const {db,feed}=await database();try{
  await sync(db,feed,page('',{updateStatus:'NOT_READY'}));let r=await report(db,feed);assert.equal(r.updateStatus,'NOT_READY');assert.equal(r.generation,1);
  const controls={reference:'NOT-READY',starts_on:'2026-01-01',ends_on:'2026-01-31',opening:'0.00',closing:'0.00'};
  await assert.rejects(call(db,'import_bank_feed_statement',feed,controls,r.windowRevision,'Bank PDF','not-ready'),/healthy bank sync/);
  assert.equal((await call(db,'get_finance_close_check',ids.entityA,'2026-01-01','2026-01-31')).bankFeedUnavailable,1);
  await sync(db,feed,page('ready'));r=await report(db,feed);const statement=await call(db,'import_bank_feed_statement',feed,controls,r.windowRevision,'Bank PDF','ready');
  await ready(db,feed);const active=await claim(db,feed);let cash=await call(db,'get_cash_reconciliation',statement);assert.equal(cash.bankFeed.ready,false);await assert.rejects(call(db,'request_cash_review',statement,'CLOSE','No new postings',cash.revision),/healthy bank sync/);
  await append(db,active,page('fresh'));cash=await call(db,'get_cash_reconciliation',statement);assert.equal(cash.bankFeed.ready,true);
  await assert.rejects(call(db,'import_bank_feed_statement',feed,controls,'0'.repeat(32),'Bank PDF','ready'),/idempotency conflict/);
 }finally{await db.close();}
});
test('full-window totals and retained bank statements detect damaged source data beyond the displayed page',async()=>{
 const {db,feed}=await database();try{
  await sync(db,feed,page('verified',{added:[source('a'),source('z','5.00')]}));const r=await report(db,feed);
  const statement=await call(db,'import_bank_feed_statement',feed,{reference:'INTEGRITY',starts_on:'2026-01-01',ends_on:'2026-01-31',opening:'0.00',closing:'105.00'},r.windowRevision,'Bank PDF','integrity');
  const damage=sql=>db.exec(`RESET ROLE;SET session_replication_role=replica;${sql};SET session_replication_role=origin;SET ROLE authenticated`);
  await damage(`UPDATE public.finance_bank_transactions SET payload=jsonb_set(payload,'{amount}','"999.00"') WHERE feed_id='${feed}' AND external_id='z'`);
  await assert.rejects(call(db,'get_bank_feed_report',feed,'2026-01-01','2026-01-31',null,1),/latest revision/);
  await damage(`UPDATE public.finance_bank_transactions SET payload=jsonb_set(payload,'{amount}','"5.00"') WHERE feed_id='${feed}' AND external_id='z'`);
  await damage(`UPDATE public.cash_statement_lines SET amount=6 WHERE statement_id='${statement}' AND external_id='z'`);
  await assert.rejects(call(db,'get_cash_reconciliation',statement),/retained provider sources/);
 }finally{await db.close();}
});
test('provider changes remain visible and block closing an affected statement until reviewed rebuild',async()=>{
 const {db,feed}=await database();try{
  await sync(db,feed,page('v1',{added:[source('receipt')]}));await journal(db,'BANK-BOOK','2026-01-02','100.00');
  let r=await report(db,feed);const controls={reference:'FEED-JAN',starts_on:'2026-01-01',ends_on:'2026-01-31',opening:'0.00',closing:'100.00'};
  const id=await call(db,'import_bank_feed_statement',feed,controls,r.windowRevision,'Verified original bank PDF','feed-import');
  assert.equal(await call(db,'import_bank_feed_statement',feed,controls,r.windowRevision,'Verified original bank PDF','feed-import'),id);
  let cash=await call(db,'get_cash_reconciliation',id);assert.equal(cash.bankFeed.changed,false);await call(db,'match_cash_statement',id,[cash.lines[0].id],[cash.bookLines[0].id],'Verified reference',cash.revision);
  cash=await call(db,'get_cash_reconciliation',id);const review=await call(db,'request_cash_review',id,'CLOSE','Matched bank statement',cash.revision);
  await sync(db,feed,page('v2',{modified:[source('receipt','90.00')]}));cash=await call(db,'get_cash_reconciliation',id);assert.equal(cash.bankFeed.changed,true);assert.equal(cash.closing,'100.00');
  await actor(db,reviewer);await assert.rejects(call(db,'decide_cash_review',review,'APPROVE','Stale source'),/provider changed/);await call(db,'decide_cash_review',review,'REJECT','Provider correction requires rebuild');await actor(db,ids.adminA);
  cash=await call(db,'get_cash_reconciliation',id);await assert.rejects(call(db,'request_cash_review',id,'CLOSE','Try old balances',cash.revision),/provider changed/);
  assert.equal((await call(db,'get_finance_close_check',ids.entityA,'2026-01-01','2026-01-31')).bankFeedConflicts,1);
  const voidReview=await call(db,'request_cash_review',id,'VOID','Rebuild from corrected bank data',cash.revision);await actor(db,reviewer);await call(db,'decide_cash_review',voidReview,'APPROVE','Verified provider correction');await actor(db,ids.adminA);
  r=await report(db,feed);const rebuilt=await call(db,'import_bank_feed_statement',feed,{...controls,reference:'FEED-JAN-CORRECTED',closing:'90.00'},r.windowRevision,'Revised bank PDF','feed-corrected');assert.notEqual(rebuilt,id);assert.equal((await call(db,'get_cash_reconciliation',rebuilt)).bankFeed.changed,false);
 }finally{await db.close();}
});
test('pending replacements, removals and newly added old transactions invalidate the exact dated source snapshot',async()=>{
 const {db,feed}=await database();try{
  await sync(db,feed,page('one',{added:[source('pending','-10.00',{state:'PENDING'}),source('posted','100.00')]}));let r=await report(db,feed);assert.equal(r.postedNet,'100.00');
  const controls={reference:'DATE-WINDOW',starts_on:'2026-01-01',ends_on:'2026-01-31',opening:'0.00',closing:'100.00'};const id=await call(db,'import_bank_feed_statement',feed,controls,r.windowRevision,'Bank statement original','dated-import');
  await sync(db,feed,page('two',{added:[source('settled','-10.00',{pendingId:'pending'})],removed:[{externalId:'pending',accountId:'account_synthetic',state:'REMOVED'}]}));r=await report(db,feed);assert.equal(r.postedNet,'90.00');assert.equal(r.statements[0].source.changed,true);
  await sync(db,feed,page('three',{removed:[{externalId:'posted',accountId:'account_synthetic',state:'REMOVED'}]}));assert.equal((await report(db,feed)).postedNet,'-10.00');assert.equal((await call(db,'get_cash_reconciliation',id)).closing,'100.00');
 }finally{await db.close();}
});
