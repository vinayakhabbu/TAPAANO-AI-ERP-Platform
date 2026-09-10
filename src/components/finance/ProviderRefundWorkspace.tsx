import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/hooks/useAuth';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import {readAllRows} from '@/lib/readAllRows';
import {parseCustomerAdjustments} from '@/lib/customerAdjustments';
import {parseProviderRefundReport,providerRefundStatus,providerRefundEvidenceSchema} from '@/lib/providerRefund';
import {downloadFinanceEvidence} from '@/lib/groupFinance';
import {FinanceActionForm} from './FinanceActionForm';
import {Button} from '@/components/ui/button';

export function ProviderRefundWorkspace({entity}:{entity:string}){
 const {user,profile}=useAuth(),[credit,setCredit]=useState(''),[cursor,setCursor]=useState<string|null>(null),today=new Date().toISOString().slice(0,10);
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const setup=useQuery({queryKey:['provider-refund-sources',user?.id,profile?.org_id,entity],enabled:Boolean(user&&profile?.org_id&&entity),retry:false,queryFn:async()=>{
  const [credits,inbox,connections]=await Promise.all([
   financeResult(supabase.rpc('get_customer_adjustments',{p_entity:entity,p_as_of:today})).then(parseCustomerAdjustments),
   readAllRows((a,b)=>supabase.from('finance_inbox').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).eq('state','APPLIED').eq('operation','RECEIPT').order('id').range(a,b)),
   readAllRows((a,b)=>supabase.from('finance_connections').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).eq('entity_id',entity).eq('provider','STRIPE').eq('enabled',true).order('id').range(a,b)),
  ]);if(credits.entityId!==entity||credits.asOf!==today)throw new Error('Refund source scope mismatch.');
  const events=inbox.flatMap(i=>{const c=connections.find(c=>c.id===i.connection_id),result=i.result as {receiptId?:string}|null;return c&&result?.receiptId?[{id:i.id,receiptId:result.receiptId,label:`${c.label} · ${c.environment} · ${i.object_id}`}]:[];});return {credits,events};
 }});
 const report=useQuery({queryKey:['provider-refund-report',user?.id,profile?.org_id,entity,cursor],enabled:Boolean(user&&profile?.org_id&&entity),retry:false,queryFn:async()=>{const r=parseProviderRefundReport(await financeResult(supabase.rpc('get_provider_refund_report',{p_entity:entity,p_cursor:cursor,p_limit:100})));if(r.entityId!==entity)throw new Error('Refund report scope mismatch.');return r;}});
 const c=setup.data?.credits.credits.find(c=>c.id===credit),invoice=setup.data?.credits.invoices.find(i=>i.id===c?.invoiceId),events=setup.data?.events.filter(e=>invoice?.receipts.some(r=>r.id===e.receiptId));
 return <section className="space-y-4 border-t pt-6"><h2 className="text-lg font-semibold">Provider refunds</h2><p>Approve an exact refund against the original Stripe invoice payment. Approved amounts stay reserved until the provider confirms the outcome. A second accounting review posts verified funds to processor clearing.</p>
  <Button variant="outline" disabled={report.isFetching||setup.isFetching} onClick={()=>{void report.refetch();void setup.refetch();}}>Refresh provider refunds</Button>
  {setup.isError||report.isError?<div role="alert"><p>Provider refund evidence unavailable. Previously loaded statuses and exports must not be used.</p><Button variant="outline" onClick={()=>{void report.refetch();void setup.refetch();}}>Retry provider refunds</Button></div>:null}
  {setup.isFetching||report.isFetching?<p>Validating provider refund evidence…</p>:null}
  <div hidden={setup.isFetching||report.isFetching||setup.isError||report.isError} className="space-y-4">
   {canWrite&&setup.data?<details><summary>Prepare a Stripe refund</summary><label>Provider refund customer credit<select aria-label="Provider refund customer credit" className="block w-full rounded border bg-background p-2" value={credit} onChange={e=>setCredit(e.target.value)}><option value="">Choose…</option>{setup.data.credits.credits.filter(c=>!c.reversedOn&&c.availableToUse!=='0.00').map(c=><option key={c.id} value={c.id}>{c.reference} · Available {c.availableToUse} USD</option>)}</select></label>
    {c?<FinanceActionForm key={c.id} title="Request Stripe refund" fields={[{name:'event',label:'Verified original Stripe payment',options:events?.map(e=>({value:e.id,label:e.label}))??[]},{name:'amount',label:'Stripe refund amount'},{name:'reference',label:'Stripe refund reference'},{name:'reason',label:'Customer refund approval evidence'}]} submit={(v,key)=>requestFinance(entity,'PROVIDER_REFUND',{id:key,credit_id:v.credit,event_id:v.event,amount:v.amount,reference:v.reference,date:v.date},v.reason,key)}><input type="hidden" name="credit" value={c.id}/><input type="hidden" name="date" value={today}/><p>The provider must verify a single USD card payment allocated entirely to this invoice. Refunds return to that original payment method.</p></FinanceActionForm>:null}
   </details>:null}
   {report.data?.refunds.map(j=><article key={j.id} aria-label={`Provider refund ${j.reference}`} className="space-y-3 rounded border p-4"><h3 className="font-semibold">{j.reference} · {j.amount} USD · {j.environment}</h3><p>{providerRefundStatus(j)}</p><p>Provider reference: {j.providerId??'Awaiting provider confirmation'} · Latest verification: {j.lastCheckedAt??'Not checked'}</p>
    {j.lastError?<p role="alert">Provider processing needs attention: {j.lastError}. The outcome must be resolved before releasing reserved credit.</p>:null}
    {j.proof?<p>Provider status: {j.proof.status} · Balance entry: {j.proof.balance?.id??'Not available'}{j.proof.failureBalance?` · Return entry: ${j.proof.failureBalance.id}`:''}</p>:null}
    {canWrite&&!j.canceled?<FinanceActionForm title="Queue provider refund verification" fields={j.dispatchStartedAt&&!j.providerId?[{name:'provider',label:'Known Stripe refund reference for recovery',optional:true}]:[]} submit={v=>financeResult(supabase.rpc('request_provider_refund_check',{p_job:j.id,p_provider_id:v.provider||null}))}/>:null}
    {canWrite&&!j.canceled&&!j.dispatchStartedAt?<FinanceActionForm title="Request refund cancellation" fields={[{name:'reason',label:'Refund cancellation evidence'}]} submit={(v,key)=>requestFinance(entity,'PROVIDER_REFUND_CANCEL',{job_id:j.id},v.reason,key)}/>:null}
    {canWrite&&j.proof?.status==='succeeded'&&!j.useId&&j.postingDate&&!j.lastError?<FinanceActionForm title="Request verified refund posting" fields={[{name:'reason',label:'Provider refund posting evidence'}]} submit={(v,key)=>requestFinance(entity,'PROVIDER_REFUND_POST',{job_id:j.id,date:v.date},v.reason,key)}><input type="hidden" name="date" value={j.postingDate}/><p>Accounting date: {j.postingDate}. Debit customer credit liability and credit processor clearing. A closed period must be reopened through its review controls.</p></FinanceActionForm>:null}
    {canWrite&&j.useId&&!j.reversedOn&&j.proof&&['failed','canceled'].includes(j.proof.status)&&j.returnDate&&!j.lastError?<FinanceActionForm title="Request returned refund correction" fields={[{name:'reason',label:'Returned refund accounting evidence'}]} submit={(v,key)=>requestFinance(entity,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:j.useId!,date:v.date},v.reason,key)}><input type="hidden" name="date" value={j.returnDate}/><p>Return accounting date: {j.returnDate}. The original refund remains in the audit history.</p></FinanceActionForm>:null}
    <RefundEvidence jobId={j.id} verifiedAt={j.lastCheckedAt}/>
    {j.journalId?<p>Posted journal: {j.journalId}{j.reversalJournalId?` · Return journal: ${j.reversalJournalId}`:''}</p>:null}
   </article>)}
  </div>
  {report.data&&!report.isError&&!report.isFetching&&!setup.isError&&!setup.isFetching?<div className="flex flex-wrap gap-2"><p>Showing {report.data.refunds.length} of {report.data.total} refunds.</p><Button variant="outline" onClick={()=>downloadFinanceEvidence(`provider-refunds-${entity}-${cursor??'first'}.json`,JSON.stringify(report.data,null,2))}>Export provider refund evidence page</Button>{cursor?<Button variant="outline" onClick={()=>setCursor(null)}>First refunds page</Button>:null}{report.data.nextCursor?<Button variant="outline" onClick={()=>setCursor(report.data!.nextCursor)}>Next refunds page</Button>:null}</div>:null}
 </section>;
}

function RefundEvidence({jobId,verifiedAt}:{jobId:string;verifiedAt:string|null}){
 const {user,profile}=useAuth(),[open,setOpen]=useState(false),[cursor,setCursor]=useState<string|null>(null);
 const q=useQuery({queryKey:['provider-refund-history',user?.id,profile?.org_id,jobId,verifiedAt,cursor],enabled:Boolean(open&&user&&profile?.org_id),retry:false,queryFn:async()=>{const r=providerRefundEvidenceSchema.parse(await financeResult(supabase.rpc('get_provider_refund_evidence',{p_job:jobId,p_cursor:cursor,p_limit:100})));if(r.jobId!==jobId||r.observations.some(o=>o.proof.jobId!==jobId))throw new Error('Provider evidence scope mismatch.');return r;}});
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Provider verification history</summary>{q.isError?<p role="alert">Provider verification history unavailable.</p>:q.isFetching?<p>Validating provider history…</p>:q.data?<div className="space-y-2"><p>{q.data.observations.length} of {q.data.total} verified observations on this page.</p>{q.data.observations.map(o=><p key={o.id}>{o.observedAt} · {o.proof.status} · {o.proof.id}</p>)}<Button variant="outline" onClick={()=>downloadFinanceEvidence(`provider-refund-history-${jobId}-${cursor??'first'}.json`,JSON.stringify(q.data,null,2))}>Export provider verification history</Button>{cursor?<Button variant="outline" onClick={()=>setCursor(null)}>Newest refund observations</Button>:null}{q.data.nextCursor?<Button variant="outline" onClick={()=>setCursor(q.data!.nextCursor)}>Older refund observations</Button>:null}</div>:null}{q.isError?<Button variant="outline" onClick={()=>void q.refetch()}>Retry refund observations</Button>:null}</details>;
}
