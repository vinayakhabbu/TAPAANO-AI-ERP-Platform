import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppLayout} from '@/components/layout/AppLayout';
import {FinanceActionForm} from '@/components/finance/FinanceActionForm';
import {Evidence,FinanceApprovals} from '@/components/finance/FinanceApprovals';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/useAuth';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {readAllRows} from '@/lib/readAllRows';
import {integrationReportSchema} from '@/lib/financeIntegration';

export default function FinanceIntegrations(){const {user,profile}=useAuth();return <AppLayout title="Finance integrations" subtitle="Verified provider events, clearing balances and independent posting review"><IntegrationWorkspace key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function IntegrationWorkspace(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [entity,setEntity]=useState(''),[asOf,setAsOf]=useState(new Date().toISOString().slice(0,10)),[cursor,setCursor]=useState<string|null>(null),[editing,setEditing]=useState('');
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const history=useQuery({queryKey:['integration-sources',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:async()=>{
  const org=profile!.org_id!;const [connections,invoices,registers,contracts]=await Promise.all([
   readAllRows((a,b)=>supabase.from('finance_connections').select('*',{count:'exact'}).eq('org_id',org).order('id').range(a,b)),
   readAllRows((a,b)=>supabase.from('invoices').select('id,entity_id,invoice_number,currency',{count:'exact'}).eq('org_id',org).eq('accounting_status','POSTED').order('id').range(a,b)),
   readAllRows((a,b)=>supabase.from('cash_registers').select('*',{count:'exact'}).eq('org_id',org).order('id').range(a,b)),
   readAllRows((a,b)=>supabase.from('finance_contracts').select('*',{count:'exact'}).eq('org_id',org).order('id').range(a,b)),
  ]);return {connections,invoices,registers,contracts};
 }});
 const report=useQuery({queryKey:['integration-report',user?.id,profile?.org_id,entity,asOf,cursor],enabled:Boolean(user&&profile?.org_id&&entity&&asOf),retry:false,queryFn:async()=>integrationReportSchema.parse(await financeResult(supabase.rpc('get_finance_integration_report',{p_entity:entity,p_as_of:asOf,p_cursor:cursor??undefined,p_limit:100}))) });
 const names=new Map([...(accounts.data??[]).map(a=>[a.id,`${a.code} ${a.name}`] as const),...(history.data?.connections??[]).map(c=>[c.id,c.label] as const)]);
 const connection=history.data?.connections.find(c=>c.id===editing);
 function exportPage(){if(!report.data||report.isError)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report.data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`integration-evidence-${asOf}-${cursor??'first'}.json`;link.click();URL.revokeObjectURL(url);}
 return <div className="space-y-6">
  <p>Provider events enter a review queue. Select the matching invoice, bank register or usage contract and have a second operator approve the posting. Processor payouts remain subject to bank reconciliation. Fees and payroll batches require their own balanced source journal.</p>
  <div className="grid gap-3 sm:grid-cols-2"><label>Integration entity<select aria-label="Integration entity" className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>{setEntity(e.target.value);setCursor(null);}}><option value="">Choose…</option>{entities.data?.map(e=><option key={e.id} value={e.id}>{e.name} ({e.currency})</option>)}</select></label><label>Clearing balances as of<input aria-label="Clearing balances as of" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="block w-full rounded border bg-background p-2"/></label></div>
  {history.isError||entities.isError||accounts.isError?<p role="alert">Integration setup and mapping history unavailable.</p>:<>
   {entity&&profile?.role==='admin'?<details><summary className="font-semibold">Configure a reviewed connection</summary><label>Connection configuration<select aria-label="Connection configuration" className="block w-full rounded border bg-background p-2" value={editing} onChange={e=>setEditing(e.target.value)}><option value="">New connection</option>{history.data?.connections.filter(c=>c.entity_id===entity).map(c=><option key={c.id} value={c.id}>{c.label} · version {c.version}</option>)}</select></label>
    <FinanceActionForm key={`${entity}:${editing}:${connection?.version??0}`} title="Request integration configuration" fields={[
     {name:'label',label:'Connection label',value:connection?.label},{name:'provider',label:'Provider',value:connection?.provider??'STRIPE',options:[{value:'STRIPE',label:'Stripe'},{value:'GENERIC',label:'Signed usage and journal source'}]},
     {name:'account',label:'Provider account reference',value:connection?.provider_account},{name:'environment',label:'Provider environment',value:connection?.environment??'TEST',options:[{value:'TEST',label:'Test'},{value:'LIVE',label:'Live'}]},
     {name:'timezone',label:'Accounting timezone',value:connection?.timezone??'America/New_York'},{name:'clearing',label:'Processor clearing asset account',value:connection?.clearing_account_id,options:accounts.data?.filter(a=>a.account_type==='asset'&&a.is_active).map(a=>({value:a.id,label:`${a.code} ${a.name}`}))??[]},
     {name:'enabled',label:'Receive events',value:String(connection?.enabled??true),options:[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]},{name:'reason',label:'Connection configuration evidence'},
    ]} submit={(v,key)=>requestFinance(entity,'INTEGRATION_CONFIG',{id:connection?.id??key,label:v.label,provider:v.provider,provider_account:v.account,environment:v.environment,timezone:v.timezone,clearing_account_id:v.clearing,enabled:v.enabled==='true',expected_version:connection?.version??0},v.reason,key)}/>
    <p className="text-sm">Changes to the label and enabled state require approval. Create a new connection for a different provider account or accounting mapping.</p></details>:null}
   {history.data?.connections.filter(c=>!entity||c.entity_id===entity).map(c=><article className="rounded border p-3" key={c.id}><h2 className="font-semibold">{c.label} · {c.environment} · {c.enabled?'Enabled':'Disabled'}</h2><p>{c.provider} · {c.provider_account} · {names.get(c.clearing_account_id)}</p><p className="text-xs break-all">Connection reference: {c.id}</p></article>)}
   {report.isError?<p role="alert" className="text-destructive">Integration report unavailable. Previously loaded figures must not be used.</p>:report.data?<section className="space-y-4">
    <h2 className="font-semibold">Clearing balances · {report.data.asOf}</h2>{report.data.controls.map(c=><p key={c.connectionId}>{names.get(c.connectionId)} · {names.get(c.accountId)}: {c.balance} {report.data.currency}</p>)}
    <p className="text-sm">Balances cover the complete ledger through the selected date. The event history includes all receipt dates and shows {report.data.events.length} of {report.data.totalEvents} events on this page.</p>
    <div className="flex gap-2"><Button variant="outline" onClick={()=>void report.refetch()}>Refresh integration history</Button><Button variant="outline" onClick={exportPage}>Export integration evidence page</Button>{cursor?<Button variant="outline" onClick={()=>setCursor(null)}>Newest events</Button>:null}{report.data.nextCursor?<Button variant="outline" onClick={()=>setCursor(report.data!.nextCursor)}>Older events</Button>:null}</div>
    {report.data.events.map(event=><article key={event.id} className="space-y-3 rounded border p-4"><h3 className="font-semibold">{event.connection} · {event.operation} · {event.state}</h3><p>{event.object} · {event.deliveries} provider deliveries · received {event.receivedAt}</p><Evidence value={event.source as Json} names={names}/>
     {canWrite&&event.state==='RECEIVED'?<FinanceActionForm title="Request provider event decision" fields={[
      {name:'action',label:'Event action',value:event.operation==='UNSUPPORTED'?'INTEGRATION_IGNORE':'INTEGRATION_APPLY',options:event.operation==='UNSUPPORTED'?[{value:'INTEGRATION_IGNORE',label:'Ignore with recorded evidence'}]:[{value:'INTEGRATION_APPLY',label:'Approve mapping and post'},{value:'INTEGRATION_IGNORE',label:'Ignore with recorded evidence'}]},
      ...(event.operation==='RECEIPT'?[{name:'target',label:'Matching customer invoice',optional:true,options:history.data?.invoices.filter(i=>i.entity_id===entity).map(i=>({value:i.id,label:`${i.invoice_number} (${i.currency})`}))??[]}]:event.operation==='PAYOUT'?[{name:'target',label:'Receiving bank register',optional:true,options:history.data?.registers.filter(i=>i.entity_id===entity).map(i=>({value:i.id,label:i.name}))??[]}]:event.operation==='USAGE'?[{name:'target',label:'Matching usage contract',optional:true,options:history.data?.contracts.filter(i=>i.entity_id===entity).map(i=>({value:i.id,label:i.reference}))??[]}]:[]),
      {name:'reason',label:'Provider source and mapping evidence'},
     ]} submit={(v,key)=>requestFinance(entity,v.action,{event_id:event.id,...(v.target?{target_id:v.target}:{})},v.reason,key)}/>:null}
     {event.result?<Evidence value={event.result as Json} names={names}/>:null}{event.reversal?<Evidence value={event.reversal as Json} names={names}/>:null}
     {canWrite&&event.state==='APPLIED'&&event.operation!=='USAGE'?<details><summary>Correct this provider posting</summary><FinanceActionForm title="Request provider posting reversal" fields={[{name:'date',label:'Correction accounting date',type:'date'},{name:'reason',label:'Provider correction evidence'}]} submit={(v,key)=>requestFinance(entity,'INTEGRATION_REVERSE',{event_id:event.id,date:v.date},v.reason,key)}/></details>:null}
    </article>)}
   </section>:report.isFetching?<p>Validating integration sources…</p>:null}
  </>}
  <FinanceApprovals entityId={entity||undefined}/>
 </div>;
}
