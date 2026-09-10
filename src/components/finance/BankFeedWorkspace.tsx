import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/hooks/useAuth';
import {supabase} from '@/integrations/supabase/client';
import {readAllRows} from '@/lib/readAllRows';
import {parseBankFeedReport} from '@/lib/bankFeed';
import {downloadFinanceEvidence} from '@/lib/groupFinance';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {FinanceActionForm} from './FinanceActionForm';
import {FinanceApprovals} from './FinanceApprovals';
import {Button} from '@/components/ui/button';

export function BankFeedWorkspace(){const {user,profile}=useAuth();return <BankFeeds key={`${user?.id}:${profile?.org_id}`}/>;}
function BankFeeds(){
 const {user,profile}=useAuth(),[feed,setFeed]=useState(''),[from,setFrom]=useState(new Date().toISOString().slice(0,8)+'01'),[through,setThrough]=useState(new Date().toISOString().slice(0,10)),[cursor,setCursor]=useState<string|null>(null);
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const setup=useQuery({queryKey:['bank-feed-setup',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),retry:false,queryFn:async()=>{
  const org=profile!.org_id!;const [feeds,registers]=await Promise.all([
   readAllRows((a,b)=>supabase.from('finance_bank_feeds').select('*',{count:'exact'}).eq('org_id',org).order('id').range(a,b)),
   readAllRows((a,b)=>supabase.from('cash_registers').select('*',{count:'exact'}).eq('org_id',org).eq('currency','USD').order('id').range(a,b)),
  ]);return {feeds,registers};
 }});
 const report=useQuery({queryKey:['bank-feed-report',user?.id,profile?.org_id,feed,from,through,cursor],enabled:Boolean(user&&profile?.org_id&&feed&&from&&through),retry:false,queryFn:async()=>{
  const r=parseBankFeedReport(await financeResult(supabase.rpc('get_bank_feed_report',{p_feed:feed,p_from:from,p_through:through,p_cursor:cursor,p_limit:100})));
  if(r.feed.id!==feed||r.feed.org_id!==profile?.org_id||r.from!==from||r.through!==through)throw new Error('Bank feed scope mismatch.');return r;
 }});
 const r=report.data;
 if(setup.isError)return <section role="alert"><p>Bank feed setup unavailable.</p><Button variant="outline" onClick={()=>void setup.refetch()}>Retry bank feed setup</Button></section>;
 return <section className="mb-8 space-y-4 border-b pb-6"><h2 className="text-lg font-semibold">Connected bank feeds</h2><p>Synchronize posted and pending bank transactions, review provider corrections, and prepare a statement from the verified feed. Opening and closing balances must come from the bank statement.</p>
  {profile?.role==='admin'?<details><summary>Configure bank feed</summary><FinanceActionForm title="Request bank feed connection" fields={[
   {name:'register',label:'Bank feed cash register',options:setup.data?.registers.map(x=>({value:x.id,label:x.name}))??[]},{name:'label',label:'Bank feed label'},
   {name:'environment',label:'Bank feed environment',value:'SANDBOX',options:[{value:'SANDBOX',label:'Sandbox'},{value:'PRODUCTION',label:'Production'}]},
   {name:'item',label:'Approved Plaid item reference'},{name:'account',label:'Approved Plaid account reference'},{name:'coverage',label:'Reviewed bank history begins',type:'date'},{name:'reason',label:'Bank consent and account mapping evidence'},
  ]} submit={(v,key)=>{const register=setup.data?.registers.find(x=>x.id===v.register);if(!register)throw new Error('Cash register unavailable.');return requestFinance(register.entity_id,'BANK_FEED_CONFIG',{id:key,register_id:v.register,label:v.label,environment:v.environment,item_id:v.item,account_id:v.account,coverage_start:v.coverage,enabled:true,expected_version:0},v.reason,key);}}/><p>Two administrators approve the mapping. Your integration administrator activates the approved connection using the bank consent credentials.</p></details>:null}
  <label className="block">Bank feed<select aria-label="Bank feed" value={feed} onChange={e=>{setFeed(e.target.value);setCursor(null);}} className="block w-full rounded border bg-background p-2"><option value="">Select bank feed…</option>{setup.data?.feeds.map(f=><option key={f.id} value={f.id}>{f.label} · {f.environment} · {f.enabled?'Enabled':'Disabled'}</option>)}</select></label>
  {feed?<><div className="grid gap-3 sm:grid-cols-2"><label>Feed window starts<input aria-label="Feed window starts" type="date" value={from} onChange={e=>{setFrom(e.target.value);setCursor(null);}} className="block w-full rounded border bg-background p-2"/></label><label>Feed window ends<input aria-label="Feed window ends" type="date" value={through} onChange={e=>{setThrough(e.target.value);setCursor(null);}} className="block w-full rounded border bg-background p-2"/></label></div>
   <Button variant="outline" onClick={()=>{void report.refetch();void setup.refetch();}}>Refresh bank feed</Button>
   {report.isError?<div role="alert"><p>Bank feed unavailable. Previously loaded transactions and totals must not be used.</p><Button variant="outline" onClick={()=>void report.refetch()}>Retry bank feed</Button></div>:report.isFetching?<p>Validating bank feed…</p>:null}
   {/* Keep frozen requests and their confirmation mounted while invalidation revalidates the report. */}
   {r?<div className="space-y-4" hidden={report.isFetching||report.isError}>
    <p>{r.updateStatus} · Last successful synchronization: {r.lastSuccessAt??'Not synchronized'} · {r.syncInProgress?'Synchronization in progress':'No batch in progress'}</p>
    {r.lastError?<p role="alert">Bank synchronization needs attention: {r.lastError}. Next attempt: {r.nextAttemptAt}.</p>:null}
    <p>Posted bank movement in this window: <strong>{r.postedNet} USD</strong> across {r.postedCount} transactions. Pending items are excluded.</p>
    {canWrite&&r.feed.enabled?<FinanceActionForm title="Queue bank synchronization" fields={[]} submit={()=>financeResult(supabase.rpc('request_bank_feed_sync',{p_feed:feed}))}/>:null}
    {profile?.role==='admin'?<details><summary>{r.feed.enabled?'Disable':'Enable'} this bank feed</summary><FinanceActionForm key={r.feed.version} title="Request bank feed status change" fields={[{name:'reason',label:'Bank feed status evidence'}]} submit={(v,key)=>requestFinance(r.feed.entity_id,'BANK_FEED_CONFIG',{id:r.feed.id,register_id:r.feed.register_id,label:r.feed.label,environment:r.feed.environment,item_id:r.feed.item_id,account_id:r.feed.account_id,coverage_start:r.feed.coverage_start,enabled:!r.feed.enabled,expected_version:r.feed.version},v.reason,key)}/></details>:null}
    {canWrite&&r.feed.enabled&&r.updateStatus==='HISTORICAL_UPDATE_COMPLETE'&&!r.syncInProgress&&!r.lastError?<details><summary>Prepare a bank statement from this window</summary><FinanceActionForm key={`${feed}:${from}:${through}`} title="Import verified bank feed statement" fields={[{name:'reference',label:'Feed statement reference'},{name:'opening',label:'Verified opening bank balance'},{name:'closing',label:'Verified closing bank balance'},{name:'evidence',label:'Original bank statement evidence'}]} submit={(v,key)=>financeResult(supabase.rpc('import_bank_feed_statement',{p_feed:v.feed,p_statement:{reference:v.reference,starts_on:v.from,ends_on:v.through,opening:v.opening,closing:v.closing},p_revision:v.revision,p_evidence:v.evidence,p_key:key}))}>
     <input type="hidden" name="feed" value={feed}/><input type="hidden" name="from" value={from}/><input type="hidden" name="through" value={through}/><input type="hidden" name="revision" value={r.windowRevision}/>
    </FinanceActionForm><p>The complete posted window is imported. Match the resulting statement to cash entries and obtain an independent reconciliation review.</p></details>:null}
    {r.statements.map(s=><article key={s.statementId} className="rounded border p-3"><p>{s.reference} · {s.status}</p>{s.source.changed?<p role="alert">The provider changed transactions in this statement. Its original balances remain evidence; reopen and rebuild it before relying on the reconciliation.</p>:<p>Statement source agrees with the synchronized bank feed.</p>}<a className="underline" href={`/banking?statement=${s.statementId}`}>Review bank statement</a></article>)}
    <p>Showing {r.transactions.length} of {r.totalTransactions} transaction records. Removed records retain their identifiers and revision history.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Status</th><th>Date</th><th>Description / reference</th><th>Amount USD</th></tr></thead><tbody>{r.transactions.map(t=><tr key={t.id} className="border-t"><td>{t.source.state}</td><td>{t.source.state==='REMOVED'?'—':t.source.date}</td><td>{t.source.state==='REMOVED'?'Removed by provider':t.source.description}<br/>{t.source.externalId} · revision {t.revision}</td><td>{t.source.state==='REMOVED'?'—':t.source.amount}</td></tr>)}</tbody></table></div>
    {!report.isFetching&&!report.isError?<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>downloadFinanceEvidence(`bank-feed-${feed}-${from}-${through}.json`,JSON.stringify(r,null,2))}>Export bank feed evidence page</Button>{cursor?<Button variant="outline" onClick={()=>setCursor(null)}>First bank feed page</Button>:null}{r.nextCursor?<Button variant="outline" onClick={()=>setCursor(r.nextCursor)}>Next bank feed page</Button>:null}</div>:null}
   </div>:null}
  </>:null}
  <FinanceApprovals entityId={setup.data?.feeds.find(f=>f.id===feed)?.entity_id}/>
 </section>;
}
