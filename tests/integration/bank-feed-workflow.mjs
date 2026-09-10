import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadTypescript} from '../helpers/load-typescript.mjs';
const {createBankFeedWorker}=await loadTypescript('../../supabase/functions/_shared/bankFeedWorker.ts');
const {parseBankFeedReport}=await loadTypescript('../../src/lib/bankFeed.ts');

export async function qualifyBankFeedWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email,password,api,serviceKey,db}){
 assert.ok(['127.0.0.1','localhost'].includes(new URL(api).hostname));
 const service=createClient(api,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const entity=await rpc(clientA,'create_tenant_entity',{p_name:'Bank feed acceptance',p_currency:'USD',p_reason:'Synthetic bank feed acceptance',p_idempotency_key:'bank-feed-entity'});
 await rpc(clientA,'create_accounting_period',{p_entity_id:entity,p_period_start:'2026-01-01',p_period_end:'2026-12-31',p_idempotency_key:'bank-feed-year'});
 const register=await rpc(clientA,'create_cash_register',{p_entity_id:entity,p_account_id:ids.cash,p_name:'Bank feed acceptance register'});
 const page=await browser.newPage(),failures=[];page.on('pageerror',e=>failures.push(e.message));
 await page.goto('http://127.0.0.1:4173/auth');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByText('Journal-linked posted invoices',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4173/banking');await page.getByText('Configure bank feed',{exact:true}).click();
 const form=page.getByRole('form',{name:'Request bank feed connection',exact:true});await form.getByLabel('Bank feed cash register',{exact:true}).selectOption(register);
 for(const [label,value] of [['Bank feed label','Connected acceptance bank'],['Approved Plaid item reference','item_bank_feed_acceptance'],['Approved Plaid account reference','account_bank_feed_acceptance'],['Reviewed bank history begins','2026-01-01'],['Bank consent and account mapping evidence','Signed synthetic bank consent and register mapping']])await form.getByLabel(label,{exact:true}).fill(value);
 await form.getByRole('button',{name:'Request bank feed connection',exact:true}).click();await form.getByRole('status').waitFor();
 const req=(await clientA.from('finance_requests').select('id,payload').eq('entity_id',entity).eq('kind','BANK_FEED_CONFIG')).data[0];const feed=req.payload.id;
 assert.ok((await clientA.rpc('decide_finance_action',{p_request_id:req.id,p_decision:'APPROVE',p_reason:'Self approval'})).error);assert.ok((await clientB.rpc('decide_finance_action',{p_request_id:req.id,p_decision:'APPROVE',p_reason:'Wrong tenant'})).error);
 const decision={p_request_id:req.id,p_decision:'APPROVE',p_reason:'Verified bank account and consent'};const [approved,duplicate]=await Promise.all([rpc(clientReviewer,'decide_finance_action',decision),rpc(clientReviewer,'decide_finance_action',decision)]);assert.deepEqual(approved,duplicate);
 const token='synthetic_bank_worker_'+randomUUID(),configuration={environment:'SANDBOX',itemId:'item_bank_feed_acceptance',accountId:'account_bank_feed_acceptance',clientId:'synthetic_client',secret:'synthetic_secret',accessToken:'access-sandbox-acceptance'};
 const transaction=(id,amount,extra={})=>({transaction_id:id,account_id:configuration.accountId,date:'2026-01-02',name:'Synthetic bank '+id,iso_currency_code:'USD',unofficial_currency_code:null,amount,pending:false,pending_transaction_id:null,...extra});
 const envelope=(cursor,extra={})=>({request_id:'provider-'+cursor,next_cursor:cursor,has_more:false,transactions_update_status:'HISTORICAL_UPDATE_COMPLETE',added:[],modified:[],removed:[],...extra});
 let lost=true,version=1;const savedPages=[];const providerCalls=[];
 const worker=createBankFeedWorker({token,secrets:{[feed]:configuration},rpc:async(name,args)=>{
  const result=await rpc(service,name,args);
  if(name==='append_bank_feed_page'){savedPages.push({args,result});if(lost){lost=false;throw new Error('Synthetic lost persistence response');}}
  return result;
 },fetch:async(url,init)=>{
  // Contract fixture substitutes provider transport only. Auth, RPCs and state transitions use the real local services.
  assert.ok(url.startsWith('https://sandbox.plaid.com/'));assert.equal(init.redirect,'error');const body=JSON.parse(init.body);providerCalls.push({url,body});assert.equal(body.access_token,configuration.accessToken);
  let value;
  if(url.endsWith('/item/get'))value={item:{item_id:configuration.itemId,error:null}};
  else if(url.endsWith('/accounts/get'))value={accounts:[{account_id:configuration.accountId,type:'depository',balances:{iso_currency_code:'USD',unofficial_currency_code:null}}]};
  else if(version===1)value=body.cursor?envelope('bank-cursor-final',{added:[transaction('bank-fee',3.01)]}):envelope('bank-cursor-partial',{has_more:true,added:[transaction('bank-deposit',-100),transaction('bank-pending',8.11,{pending:true})]});
  else value=envelope('bank-cursor-corrected',{added:[transaction('bank-settled',8.11,{pending_transaction_id:'bank-pending'})],modified:[transaction('bank-fee',4.01)],removed:[{transaction_id:'bank-pending',account_id:configuration.accountId}]});
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }});
 const invoke=()=>worker(new Request(api+'/functions/v1/bank-feed-worker',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({feedId:feed})}));
 const concurrent=await Promise.all([invoke(),invoke()]);const outcomes=await Promise.all(concurrent.map(r=>{assert.equal(r.status,200);return r.json();}));assert.deepEqual(outcomes.map(r=>r.state).sort(),['idle','synchronized']);assert.deepEqual(savedPages[0].args,savedPages[1].args);assert.equal(providerCalls.filter(c=>c.url.endsWith('/transactions/sync')).length,2);
 let report=parseBankFeedReport(await rpc(clientA,'get_bank_feed_report',{p_feed:feed,p_from:'2026-01-01',p_through:'2026-01-31'}));assert.equal(report.postedNet,'96.99');assert.equal(report.generation,1);assert.equal(report.transactions.length,3);
 assert.ok((await clientA.rpc('claim_bank_feed_sync',{p_feed:feed})).error);assert.ok((await clientB.rpc('get_bank_feed_report',{p_feed:feed,p_from:'2026-01-01',p_through:'2026-01-31'})).error);assert.ok((await clientA.from('finance_bank_transactions').select('*')).error);
 const journal=async(number,cash,other=ids.revenue)=>rpc(clientA,'post_manual_journal',{p_entity_id:entity,p_entry_number:number,p_entry_date:'2026-01-02',p_memo:'Synthetic bank source',p_lines:[{account_id:ids.cash,debit:cash>0?cash.toFixed(2):'0.00',credit:cash<0?(-cash).toFixed(2):'0.00'},{account_id:other,debit:cash<0?(-cash).toFixed(2):'0.00',credit:cash>0?cash.toFixed(2):'0.00'}],p_idempotency_key:number});
 await journal('BANK-FEED-DEPOSIT',100);await journal('BANK-FEED-FEE',-3.01,ids.expense);
 await page.reload();await page.getByLabel('Bank feed',{exact:true}).selectOption(feed);await page.getByLabel('Feed window starts',{exact:true}).fill('2026-01-01');await page.getByLabel('Feed window ends',{exact:true}).fill('2026-01-31');await page.getByText('96.99 USD',{exact:true}).waitFor();await page.getByText('Prepare a bank statement from this window',{exact:true}).click();
 const statementForm=page.getByRole('form',{name:'Import verified bank feed statement',exact:true});for(const [label,value] of [['Feed statement reference','BANK-FEED-JAN'],['Verified opening bank balance','0.00'],['Verified closing bank balance','96.99'],['Original bank statement evidence','Synthetic January bank PDF control totals']])await statementForm.getByLabel(label,{exact:true}).fill(value);
 const attempts=[];await page.route('**/rest/v1/rpc/import_bank_feed_statement',async route=>{attempts.push(route.request().postDataJSON());if(attempts.length===1){const response=await route.fetch();assert.equal(response.ok(),true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic lost bank import response'})});}else await route.continue();});
 await statementForm.getByRole('button',{name:'Import verified bank feed statement',exact:true}).click();await statementForm.getByRole('alert').waitFor();await statementForm.getByRole('button',{name:'Retry same request',exact:true}).click();await statementForm.getByRole('status').waitFor();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await page.unroute('**/rest/v1/rpc/import_bank_feed_statement');
 report=parseBankFeedReport(await rpc(clientA,'get_bank_feed_report',{p_feed:feed,p_from:'2026-01-01',p_through:'2026-01-31'}));assert.equal(report.statements.length,1);const original=report.statements[0].statementId;
 await page.getByRole('link',{name:'Review bank statement',exact:true}).click();await page.waitForURL('**/banking?statement='+original);await page.getByRole('heading',{name:'BANK-FEED-JAN · USD · OPEN',exact:true}).waitFor();
 let cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:original});await rpc(clientA,'match_cash_statement',{p_statement_id:original,p_bank_lines:cash.lines.map(l=>l.id),p_book_lines:cash.bookLines.map(l=>l.id),p_reason:'Matched bank references and control total',p_revision:cash.revision});cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:original});
 const close=await rpc(clientA,'request_cash_review',{p_statement_id:original,p_action:'CLOSE',p_reason:'Synthetic independent bank close',p_revision:cash.revision});await rpc(clientReviewer,'decide_cash_review',{p_review_id:close,p_decision:'APPROVE',p_reason:'Verified bank statement and posted entries'});
 version=2;await rpc(clientA,'request_bank_feed_sync',{p_feed:feed});
 // Move the disposable fixture's queue clock forward without changing financial source data.
 await db.query('BEGIN');await db.query("SELECT set_config('tapaano.accounting_write','trusted',true)");await db.query("UPDATE public.finance_bank_sync_state SET next_attempt_at=now()-INTERVAL '1 second' WHERE feed_id=$1",[feed]);await db.query('COMMIT');
 assert.equal((await invoke()).status,200);const finalPage=savedPages.at(-1);report=parseBankFeedReport(await rpc(clientA,'get_bank_feed_report',{p_feed:feed,p_from:'2026-01-01',p_through:'2026-01-31'}));assert.equal(report.postedNet,'87.88');assert.equal(report.statements[0].source.changed,true);assert.equal(report.statements[0].status,'APPROVED');
 await page.reload();await page.getByRole('alert').filter({hasText:'The bank provider changed this statement'}).waitFor();
 cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:original});assert.equal(cash.closing,'96.99');const reopen=await rpc(clientA,'request_cash_review',{p_statement_id:original,p_action:'REOPEN',p_reason:'Provider correction',p_revision:cash.revision});await rpc(clientReviewer,'decide_cash_review',{p_review_id:reopen,p_decision:'APPROVE',p_reason:'Reviewed corrected bank source'});
 cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:original});const voiding=await rpc(clientA,'request_cash_review',{p_statement_id:original,p_action:'VOID',p_reason:'Rebuild corrected bank statement',p_revision:cash.revision});await rpc(clientReviewer,'decide_cash_review',{p_review_id:voiding,p_decision:'APPROVE',p_reason:'Preserve original and use corrected bank data'});
 await journal('BANK-FEED-FEE-CORRECTION',-1,ids.expense);await journal('BANK-FEED-SETTLED',-8.11,ids.expense);
 const rebuilt=await rpc(clientA,'import_bank_feed_statement',{p_feed:feed,p_statement:{reference:'BANK-FEED-JAN-CORRECTED',starts_on:'2026-01-01',ends_on:'2026-01-31',opening:'0.00',closing:'87.88'},p_revision:report.windowRevision,p_evidence:'Corrected synthetic bank statement',p_key:'bank-feed-rebuilt'});
 cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:rebuilt});await rpc(clientA,'match_cash_statement',{p_statement_id:rebuilt,p_bank_lines:cash.lines.map(l=>l.id),p_book_lines:cash.bookLines.map(l=>l.id),p_reason:'Corrected complete bank window',p_revision:cash.revision});cash=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:rebuilt});assert.equal(cash.variance,'0.00');assert.equal(cash.unmatchedCount,0);
 await page.goto('http://127.0.0.1:4173/banking');await page.getByLabel('Bank feed',{exact:true}).selectOption(feed);await page.getByRole('button',{name:'Export bank feed evidence page',exact:true}).waitFor();await page.route('**/rest/v1/rpc/get_bank_feed_report',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic bank feed outage'})}));await page.getByRole('button',{name:'Refresh bank feed',exact:true}).click();await page.getByRole('alert').filter({hasText:'Bank feed unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Export bank feed evidence page',exact:true}).count(),0);await page.unroute('**/rest/v1/rpc/get_bank_feed_report');await page.getByRole('button',{name:'Retry bank feed',exact:true}).click();await page.getByRole('button',{name:'Export bank feed evidence page',exact:true}).waitFor();
 assert.deepEqual(failures,[]);await page.close();return {entity,feed,statements:[original,rebuilt],decision,result:approved,finalPage,importPayload:attempts[0],original};
}
