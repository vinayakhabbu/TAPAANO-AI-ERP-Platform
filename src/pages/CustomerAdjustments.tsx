import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppLayout} from '@/components/layout/AppLayout';
import {FinanceActionForm} from '@/components/finance/FinanceActionForm';
import {FinanceApprovals} from '@/components/finance/FinanceApprovals';
import {useAuth} from '@/hooks/useAuth';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import {readAllRows} from '@/lib/readAllRows';
import {parseCustomerAdjustments,customerAdjustmentCsv,type CustomerAdjustments as Report} from '@/lib/customerAdjustments';
import {downloadFinanceEvidence} from '@/lib/groupFinance';
import {Button} from '@/components/ui/button';

export default function CustomerAdjustments(){const {user,profile}=useAuth();return <AppLayout title="Customer credits and refunds" subtitle="Approved invoice adjustments and reconciled customer balances"><Workspace key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function Workspace(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [entity,setEntity]=useState(''),[asOf,setAsOf]=useState(new Date().toISOString().slice(0,10));
 const registers=useQuery({queryKey:['customer-adjustment-cash',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:()=>readAllRows((from,to)=>supabase.from('cash_registers').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).order('id').range(from,to))});
 const report=useQuery({queryKey:['customer-adjustments',user?.id,profile?.org_id,entity,asOf],enabled:Boolean(user&&profile?.org_id&&entity&&asOf),retry:false,queryFn:async()=>{const r=parseCustomerAdjustments(await financeResult(supabase.rpc('get_customer_adjustments',{p_entity:entity,p_as_of:asOf})));if(r.entityId!==entity||r.asOf!==asOf)throw new Error('Customer report scope mismatch.');return r;}});
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 return <div className="space-y-5"><p>Credits reduce the original invoice by line. Any amount already settled becomes a customer balance for future invoices or refunds. Record a refund after your bank or payment provider confirms it; this workflow records the accounting evidence.</p>
  <div className="grid gap-3 sm:grid-cols-2"><label>Customer adjustment entity<select aria-label="Customer adjustment entity" className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Choose…</option>{entities.data?.map(e=><option key={e.id} value={e.id}>{e.name} ({e.currency})</option>)}</select></label><label>Customer adjustment as of<input aria-label="Customer adjustment as of" type="date" className="block w-full rounded border bg-background p-2" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label></div>
  <Button variant="outline" disabled={!entity||report.isFetching} onClick={()=>void report.refetch()}>Refresh customer balances</Button>
  {entities.isError||accounts.isError||registers.isError?<p role="alert">Customer adjustment setup unavailable. Refresh the page to retry.</p>:report.isError?<p role="alert" className="text-destructive">Customer adjustment report unavailable. Previously loaded figures and exports must not be used.</p>:report.data?<>
   <section className="rounded border p-4 space-y-2"><h2 className="font-semibold">Customer credit liability · {report.data.currency}</h2><p>Customer balances {report.data.control.expected} · Ledger {report.data.control.ledger} · Variance {report.data.control.variance}</p><p>{report.data.control.reconciled?'Customer credit balances reconcile to the ledger.':'Customer credit balances do not reconcile. Resolve the control-account variance before closing.'}</p></section>
   {!report.data.control.configured&&profile?.role==='admin'?<FinanceActionForm key={entity} title="Request customer credit policy" fields={[{name:'account',label:'Customer credit liability account',options:(accounts.data??[]).filter(a=>a.is_active&&a.account_type==='liability').map(a=>({value:a.id,label:`${a.code} ${a.name}`}))},{name:'reason',label:'Customer credit policy evidence'}]} submit={(v,key)=>requestFinance(entity,'CUSTOMER_CREDIT_POLICY',{liability_account_id:v.account},v.reason,key)}/>:null}
   <CustomerDetail key={entity} report={report.data} canWrite={canWrite} cash={(registers.data??[]).filter(c=>c.entity_id===entity).map(c=>({value:c.account_id,label:c.name}))}/>
   <div className="flex gap-2"><Button variant="outline" onClick={()=>downloadFinanceEvidence(`customer-adjustments-${entity}-${asOf}.csv`,customerAdjustmentCsv(report.data!))}>Export customer adjustments CSV</Button><Button variant="outline" onClick={()=>downloadFinanceEvidence(`customer-adjustments-${entity}-${asOf}.json`,JSON.stringify(report.data,null,2))}>Export customer adjustment evidence</Button></div>
  </>:report.isFetching?<p>Reconciling customer credits and payment history…</p>:null}
  <FinanceApprovals entityId={entity||undefined}/>
 </div>;
}
function CustomerDetail({report:r,canWrite,cash}:{report:Report;canWrite:boolean;cash:{value:string;label:string}[]}){
 const [invoice,setInvoice]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0);const current=r.invoices.find(i=>i.id===invoice);
 const credits=r.credits.filter(c=>{const i=r.invoices.find(i=>i.id===c.invoiceId);return `${c.reference} ${i?.number} ${i?.customerName}`.toLowerCase().includes(search.toLowerCase());});
 return <section className="space-y-5">
  {canWrite&&r.control.configured?<details><summary className="font-semibold">Prepare an invoice credit</summary><label>Invoice to credit<select aria-label="Invoice to credit" className="block w-full rounded border bg-background p-2" value={invoice} onChange={e=>setInvoice(e.target.value)}><option value="">Choose…</option>{r.invoices.filter(i=>!i.legacyCredited&&i.lines.some(l=>l.available!=='0.00')).map(i=><option value={i.id} key={i.id}>{i.number} · {i.customerName} · Unpaid {i.remaining}</option>)}</select></label>
   {current?<FinanceActionForm key={current.id} title="Request customer credit" fields={[{name:'reference',label:'Customer credit reference'},{name:'date',label:'Customer credit date',type:'date'},{name:'reason',label:'Credit agreement and accounting evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CUSTOMER_CREDIT',{invoice_id:current.id,reference:v.reference,date:v.date,lines:current.lines.filter(l=>v['line-'+l.id]&&v['line-'+l.id]!=='0.00'&&v['line-'+l.id]!=='0').map(l=>({line_id:l.id,amount:v['line-'+l.id]}))},v.reason,key)}>
    <p>Original invoice {current.original} · Unpaid {current.remaining} {r.currency}. Enter the amount to credit against each original line.</p>
    {current.contractId?<p>For a contract price concession, the credit follows the original allocation across performance obligations. The review shows the recognized revenue and deferred revenue reductions. Use subscription changes for changes to future service.</p>:null}
    {current.lines.map((l,n)=><label key={l.id} className="block my-2">{l.description} · Available {l.available}<input aria-label={`Credit line ${n+1} amount`} name={'line-'+l.id} inputMode="decimal" defaultValue="0.00" className="block w-full rounded border bg-background p-2"/></label>)}
   </FinanceActionForm>:null}
  </details>:null}
  <label>Search customer credits<input aria-label="Search customer credits" className="block w-full rounded border bg-background p-2" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
  {credits.slice(page*20,page*20+20).map(c=>{const i=r.invoices.find(i=>i.id===c.invoiceId);return <article key={c.id} className="rounded border p-4 space-y-3"><h3 className="font-semibold">{c.reference} · {i?.number} · {i?.customerName}</h3><p>{c.date} · Credit {c.amount} · Receivable reduction {c.arAmount} · Customer balance created {c.balanceAmount} · Available {c.remaining} {r.currency}{c.reversedOn?` · Reversed ${c.reversedOn}`:''}</p>
   {canWrite&&!c.reversedOn&&c.remaining!=='0.00'?<div className="grid gap-4 lg:grid-cols-2"><FinanceActionForm title="Request confirmed customer refund" fields={[
    {name:'date',label:'Confirmed refund date',type:'date'},{name:'amount',label:'Confirmed refund amount'},{name:'reference',label:'Bank or provider refund reference'},{name:'cash',label:'Refund bank or clearing account',options:cash},
    {name:'receipt',label:'Original customer payment',options:(i?.receipts??[]).filter(x=>x.available!=='0.00').map(x=>({value:`${x.kind}:${x.id}`,label:`${x.date} · ${x.amount} · Refundable ${x.available}`}))},{name:'reason',label:'Refund confirmation evidence'},
   ]} submit={(v,key)=>{const [kind,id]=v.receipt.split(':');return requestFinance(r.entityId,'CUSTOMER_REFUND',{credit_id:c.id,date:v.date,amount:v.amount,reference:v.reference,cash_account_id:v.cash,settlement_id:id,settlement_kind:kind},v.reason,key);}}/>
   <FinanceActionForm title="Request customer credit application" fields={[{name:'invoice',label:'Apply to customer invoice',options:r.invoices.filter(x=>x.customerId===c.customerId&&x.remaining!=='0.00').map(x=>({value:x.id,label:`${x.number} · Unpaid ${x.remaining}`}))},{name:'date',label:'Credit application date',type:'date'},{name:'amount',label:'Credit application amount'},{name:'reference',label:'Credit application reference'},{name:'reason',label:'Credit application evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CUSTOMER_CREDIT_APPLY',{credit_id:c.id,invoice_id:v.invoice,date:v.date,amount:v.amount,reference:v.reference},v.reason,key)}/></div>:null}
   {c.uses.map(u=><div key={u.id} className="rounded border p-3"><p>{u.kind==='REFUND'?'Refund':'Application'} · {u.reference} · {u.date} · {u.amount}{u.reversedOn?` · Corrected ${u.reversedOn}`:''}</p>{canWrite&&!u.reversedOn&&!c.reversedOn?<details><summary>Correct this accounting record</summary><FinanceActionForm title="Request customer credit use correction" fields={[{name:'date',label:'Customer credit use correction date',type:'date'},{name:'reason',label:'Correction and bank evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CUSTOMER_CREDIT_USE_REVERSE',{use_id:u.id,date:v.date},v.reason,key)}/></details>:null}</div>)}
   {canWrite&&!c.reversedOn&&!c.uses.some(u=>!u.reversedOn)?<details><summary>Reverse this credit</summary><FinanceActionForm title="Request customer credit reversal" fields={[{name:'date',label:'Customer credit reversal date',type:'date'},{name:'reason',label:'Credit reversal evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CUSTOMER_CREDIT_REVERSE',{credit_id:c.id,date:v.date},v.reason,key)}/></details>:null}
  </article>;})}
  <div className="flex gap-3 items-center"><Button variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Previous credits</Button><p>{credits.length} matching credits · Page {page+1}</p><Button variant="outline" disabled={(page+1)*20>=credits.length} onClick={()=>setPage(page+1)}>Next credits</Button></div>
 </section>;
}
