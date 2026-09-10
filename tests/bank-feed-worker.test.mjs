import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {createBankFeedWorker,normalizeBankFeedPage}=await loadTypescript('../../supabase/functions/_shared/bankFeedWorker.ts');
const {parseProviderJson,providerUsd}=await loadTypescript('../../supabase/functions/_shared/providerJson.ts');
const feed=randomUUID(),run=randomUUID(),lease=randomUUID(),token='synthetic_scheduler_token_'+randomUUID();
const claim={feedId:feed,runId:run,leaseToken:lease,environment:'SANDBOX',itemId:'item_synthetic',accountId:'account_synthetic',cursor:null,pageNumber:0};
const secret={environment:'SANDBOX',itemId:claim.itemId,accountId:claim.accountId,clientId:'synthetic_client',secret:'synthetic_secret',accessToken:'access-sandbox-synthetic'};
const source=(id,extra={})=>({transaction_id:id,account_id:claim.accountId,iso_currency_code:'USD',unofficial_currency_code:null,date:'2026-01-02',name:'Bank deposit',amount:-1234.56,pending:false,pending_transaction_id:null,...extra});
const page=(cursor,extra={})=>({request_id:'request-'+cursor,next_cursor:cursor,has_more:false,transactions_update_status:'HISTORICAL_UPDATE_COMPLETE',added:[source('deposit')],modified:[],removed:[],...extra});
const response=(body,status=200)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const request=(body={feedId:feed},auth=token)=>new Request('https://erp.example/functions/v1/bank-feed-worker',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
function harness(options={}){
 const calls=[],pages=[],releases=[],providerCalls=[];
 const deps={token,secrets:{[feed]:secret},rpc:async(name,args)=>{calls.push({name,args});if(name==='claim_bank_feed_sync')return {...claim,...options.claim};if(name==='release_bank_feed_sync'){releases.push(args);return null;}pages.push(args);return {committed:!args.p_page.hasMore,nextCursor:args.p_page.nextCursor,pageNumber:args.p_number+1};},fetch:async(url,init)=>{
  providerCalls.push({url,init,body:JSON.parse(init.body)});
  assert.equal(init.redirect,'error');assert.ok(init.signal);assert.equal(init.headers['Plaid-Version'],'2020-09-14');
  if(url.endsWith('/item/get'))return response({item:{item_id:claim.itemId,error:null}});
  if(url.endsWith('/accounts/get'))return response({accounts:[{account_id:claim.accountId,type:'depository',balances:{iso_currency_code:'USD',unofficial_currency_code:null}}]});
  return options.provider?options.provider(JSON.parse(init.body)):response(page('complete'));
 }};
 return {deps,calls,pages,releases,providerCalls};
}
test('provider numeric tokens preserve exact USD cents, reject ambiguity and cannot forge a numeric token through JSON objects',()=>{
 for(const [input,expected] of [['0','0.00'],['-0.00','0.00'],['9999999999999.99','9999999999999.99'],['1.234e2','123.40'],['0.0100','0.01'],['-0.01','-0.01']])assert.equal(providerUsd(parseProviderJson(input)),expected);
 assert.equal(providerUsd(parseProviderJson('1.20'),true),'-1.20');
 for(const raw of ['0.001','10000000000000','1e99','"1.00"','{"decimal":"1.00"}'])assert.throws(()=>providerUsd(parseProviderJson(raw)));
 for(const raw of ['{"a":1,"a":2}','[1,]','{"a":1,}','01','1 false','\u00a01','"unterminated'])assert.throws(()=>parseProviderJson(raw));
});
test('worker authentication and request shape are checked before database or provider access',async()=>{
 const h=harness(),worker=createBankFeedWorker(h.deps);
 assert.equal((await worker(request({},'forged'))).status,401);assert.equal(h.calls.length,0);assert.equal(h.providerCalls.length,0);
 assert.equal((await worker(request({feedId:feed,url:'https://attacker.example',accessToken:'forged'}))).status,400);assert.equal(h.calls.length,0);
 assert.equal((await createBankFeedWorker({...h.deps,token:''})(request())).status,503);
 assert.equal((await worker(new Request('https://erp.example',{method:'GET'}))).status,405);
});
test('the native Plaid adapter binds item/account/environment and stores normalized posted/pending amounts without secrets',async()=>{
 const h=harness({provider:()=>response(page('complete',{added:[source('posted'),source('pending',{pending:true,amount:2.01})],removed:[{account_id:claim.accountId,transaction_id:'removed'}]}))});
 assert.equal((await createBankFeedWorker(h.deps)(request())).status,200);assert.equal(h.pages.length,1);
 assert.deepEqual(h.pages[0].p_page.added.map(x=>[x.state,x.amount]),[['POSTED','1234.56'],['PENDING','-2.01']]);assert.equal(h.pages[0].p_page.removed[0].state,'REMOVED');
 assert.match(h.pages[0].p_body_sha256,/^[a-f0-9]{64}$/);assert.ok(h.providerCalls.every(c=>c.url.startsWith('https://sandbox.plaid.com/')));assert.deepEqual(h.providerCalls.at(-1).body.options,{account_id:claim.accountId,days_requested:730});assert.equal(h.providerCalls.at(-1).body.count,500);
 assert.ok(!JSON.stringify(h.pages).includes(secret.accessToken));assert.ok(!JSON.stringify(h.pages).includes(secret.secret));
 const mismatch=harness();mismatch.deps.secrets={[feed]:{...secret,environment:'PRODUCTION'}};assert.equal((await createBankFeedWorker(mismatch.deps)(request())).status,503);assert.equal(mismatch.providerCalls.length,0);assert.equal(mismatch.releases[0].p_error,'CONFIGURATION');
});
test('pagination persists each page, retries a lost database response exactly and advances once',async()=>{
 const h=harness({provider:body=>response(page(body.cursor?'second':'first',{has_more:!body.cursor,added:[source(body.cursor?'second':'first')]}))});
 const base=h.deps.rpc;let lost=true;h.deps.rpc=async(name,args)=>{const r=await base(name,args);if(name==='append_bank_feed_page'&&lost){lost=false;throw new Error('Synthetic lost commit response');}return r;};
 const r=await createBankFeedWorker(h.deps)(request());assert.equal(r.status,200);assert.equal((await r.json()).state,'synchronized');assert.equal(h.pages.length,3);assert.deepEqual(h.pages[0],h.pages[1]);assert.equal(h.pages[2].p_cursor,'first');assert.equal(h.pages[2].p_number,1);
 assert.equal(h.providerCalls.filter(c=>c.url.endsWith('/transactions/sync')).length,2);
});
test('pagination mutation abandons the whole batch and does not publish a success response',async()=>{
 const h=harness({provider:body=>body.cursor?response({error_code:'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',secret:'must-not-escape'},400):response(page('partial',{has_more:true}))});
 const r=await createBankFeedWorker(h.deps)(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'bank_sync_incomplete',code:'CURSOR_MUTATION'});assert.equal(h.pages.length,1);assert.equal(h.releases[0].p_error,'CURSOR_MUTATION');
});
test('long batches yield after three durable pages and queue continuation without changing the committed cursor',async()=>{
 let n=0;const h=harness({provider:()=>response(page('cursor-'+(++n),{has_more:true}))});
 const r=await createBankFeedWorker(h.deps)(request());assert.equal(r.status,200);assert.equal((await r.json()).state,'continuation_queued');assert.equal(h.pages.length,3);assert.equal(h.releases[0].p_error,null);
});
test('an empty initial Plaid cursor records a waiting state and never claims bank history is complete',async()=>{
 const h=harness({provider:()=>response(page('',{transactions_update_status:'NOT_READY',added:[]}))});const r=await createBankFeedWorker(h.deps)(request());assert.equal(r.status,200);assert.equal((await r.json()).state,'waiting_for_bank');assert.equal(h.pages[0].p_page.nextCursor,'');
});
test('unsupported account sources, fractional cents, invalid dates and provider errors fail with sanitized recovery status',async()=>{
 for(const change of [{account_id:'different'},{amount:0.001},{date:'2026-02-30'},{iso_currency_code:'EUR'},{amount:'1.00'}]){
  const h=harness({provider:()=>response(page('bad',{added:[source('bad',change)]}))});assert.equal((await createBankFeedWorker(h.deps)(request())).status,503);assert.equal(h.pages.length,0);assert.equal(h.releases[0].p_error,'INVALID_SOURCE');
 }
 for(const [status,error,code] of [[429,'RATE_LIMIT_EXCEEDED','RATE_LIMITED'],[400,'ITEM_LOGIN_REQUIRED','AUTH_REQUIRED'],[503,'INTERNAL_ERROR','PROVIDER_UNAVAILABLE']]){
  const h=harness({provider:()=>response({error_code:error,error_message:'private provider diagnostic'},status)});const r=await createBankFeedWorker(h.deps)(request());assert.equal(r.status,503);assert.equal((await r.json()).code,code);assert.equal(h.pages.length,0);
 }
 assert.throws(()=>normalizeBankFeedPage({has_more:false},claim.accountId));
});
