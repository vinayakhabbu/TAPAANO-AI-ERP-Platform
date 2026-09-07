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
import {intercompanySchema,downloadFinanceEvidence} from '@/lib/groupFinance';

export default function IntercompanyFinance(){const {user,profile}=useAuth();return <AppLayout title="Intercompany accounting" subtitle="Bilateral service, funding and settlement with independent review"><Workspace key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function Workspace(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [entity,setEntity]=useState(''),[other,setOther]=useState(''),[kind,setKind]=useState('SERVICE'),[asOf,setAsOf]=useState(new Date().toISOString().slice(0,10));const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const registers=useQuery({queryKey:['intercompany-registers',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:()=>readAllRows((a,b)=>supabase.from('cash_registers').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).order('id').range(a,b))});
 const report=useQuery({queryKey:['intercompany-report',user?.id,profile?.org_id,entity,asOf],enabled:Boolean(user&&profile?.org_id&&entity&&asOf),retry:false,queryFn:async()=>{const r=intercompanySchema.parse(await financeResult(supabase.rpc('get_intercompany_report',{p_entity:entity,p_as_of:asOf})));if(r.entityId!==entity||r.asOf!==asOf)throw new Error('Intercompany report scope mismatch.');return r;}});
 const current=entities.data?.find(e=>e.id===entity),options=(type:string)=>(accounts.data??[]).filter(a=>a.is_active&&a.account_type===type).map(a=>({value:a.id,label:`${a.code} ${a.name}`}));
 const names=new Map([...(accounts.data??[]).map(a=>[a.id,`${a.code} ${a.name}`] as const),...(entities.data??[]).map(e=>[e.id,e.name] as const)]),cash=(e:string)=>(registers.data??[]).filter(r=>r.entity_id===e).map(r=>({value:r.account_id,label:`${r.name} · ${names.get(r.account_id)}`}));
 return <div className="space-y-6"><p>One approval posts both entities atomically. Service creates the originating entity's receivable and revenue, and the counterparty's payable and expense. Funding records the two bank movements and corresponding intercompany balances. Settlement records accounting evidence; money movement is handled by your bank.</p>
  <div className="grid gap-3 sm:grid-cols-2"><label>Intercompany entity<select aria-label="Intercompany entity" className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>{setEntity(e.target.value);setOther('');}}><option value="">Choose…</option>{entities.data?.map(e=><option value={e.id} key={e.id}>{e.name} ({e.currency})</option>)}</select></label><label>Intercompany as of<input aria-label="Intercompany as of" className="block w-full rounded border bg-background p-2" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label></div>
  {entities.isError||accounts.isError||registers.isError?<p role="alert">Intercompany setup unavailable.</p>:<>
   {canWrite&&current?<details><summary className="font-semibold">Prepare an intercompany transaction</summary><div className="grid gap-3 sm:grid-cols-2"><label>Counterparty entity<select aria-label="Counterparty entity" className="block w-full rounded border bg-background p-2" value={other} onChange={e=>setOther(e.target.value)}><option value="">Choose…</option>{entities.data?.filter(e=>e.id!==entity&&e.currency===current.currency).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>Intercompany type<select aria-label="Intercompany type" className="block w-full rounded border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="SERVICE">Service</option><option value="FUNDING">Funding</option></select></label></div>
    {other?<FinanceActionForm key={`${entity}:${other}:${kind}`} title="Request intercompany transaction" fields={[
     {name:'reference',label:'Intercompany reference'},{name:'date',label:'Intercompany date',type:'date'},{name:'amount',label:'Intercompany amount'},
     {name:'due_from',label:'Originating entity due-from account',options:options('asset')},{name:'due_to',label:'Counterparty due-to account',options:options('liability')},
     {name:'seller_offset',label:kind==='SERVICE'?'Originating service revenue':'Originating funding bank',options:kind==='SERVICE'?options('revenue'):cash(entity)},
     {name:'buyer_offset',label:kind==='SERVICE'?'Counterparty service expense':'Counterparty receiving bank',options:kind==='SERVICE'?options('expense'):cash(other)},{name:'reason',label:'Bilateral source and policy evidence'},
    ]} submit={(v,key)=>requestFinance(entity,'INTERCOMPANY_CREATE',{reference:v.reference,kind,counterparty_entity_id:other,date:v.date,currency:current.currency,amount:v.amount,due_from_account_id:v.due_from,due_to_account_id:v.due_to,seller_offset_account_id:v.seller_offset,buyer_offset_account_id:v.buyer_offset},v.reason,key)}/>:null}
    <p className="text-sm">The entities must share a functional currency and have open posting periods. Use dedicated intercompany controls. Foreign subsidiaries can be translated in consolidation; cross-currency transaction remeasurement requires a separately accepted workflow.</p>
   </details>:null}
   {report.isError?<p role="alert" className="text-destructive">Intercompany report unavailable. Previously loaded balances must not be used.</p>:report.data?<section className="space-y-4">
    <div className="flex gap-2"><Button variant="outline" onClick={()=>void report.refetch()}>Refresh intercompany report</Button><Button variant="outline" onClick={()=>downloadFinanceEvidence(`intercompany-${entity}-${asOf}.json`,JSON.stringify(report.data,null,2))}>Export intercompany evidence</Button></div>
    <h2 className="font-semibold">Due-from and due-to controls · {report.data.currency}</h2>{report.data.controls.map(c=><p key={c.accountId}>{names.get(c.accountId)} · Expected {c.expected} · Ledger {c.ledger} · Variance {c.variance}</p>)}
    {report.data.transfers.map(t=><article key={t.id} className="rounded border p-4 space-y-3"><h3 className="font-semibold">{t.reference} · {t.kind} · {t.reversedOn?'Reversed':'Open'}</h3><p>{names.get(t.sellerId)} → {names.get(t.buyerId)} · {t.date} · Original {t.amount} · Outstanding {t.outstanding} {report.data.currency}</p><details><summary>Approved intercompany terms</summary><Evidence value={t.terms as Json} names={names}/></details>
     {canWrite&&entity===t.sellerId&&!t.reversedOn?<><FinanceActionForm title="Request intercompany settlement" fields={[{name:'date',label:'Settlement date',type:'date'},{name:'amount',label:'Settlement amount'},{name:'seller_cash',label:'Originating receiving bank',options:cash(t.sellerId)},{name:'buyer_cash',label:'Counterparty paying bank',options:cash(t.buyerId)},{name:'reason',label:'Settlement source evidence'}]} submit={(v,key)=>requestFinance(t.sellerId,'INTERCOMPANY_SETTLE',{transfer_id:t.id,date:v.date,amount:v.amount,seller_cash_account_id:v.seller_cash,buyer_cash_account_id:v.buyer_cash},v.reason,key)}/>
      <details><summary>Reverse the complete transaction</summary><FinanceActionForm title="Request intercompany reversal" fields={[{name:'date',label:'Transaction reversal date',type:'date'},{name:'reason',label:'Bilateral reversal evidence'}]} submit={(v,key)=>requestFinance(t.sellerId,'INTERCOMPANY_REVERSE',{transfer_id:t.id,date:v.date},v.reason,key)}/></details></>:null}
     {t.settlements.map(s=><div key={s.id} className="rounded border p-3 space-y-2"><p>Settlement {s.date} · {s.amount}{s.reversedOn?` · Corrected ${s.reversedOn}`:''}</p>{canWrite&&entity===t.sellerId&&!s.reversedOn&&!t.reversedOn?<FinanceActionForm title="Request settlement correction" fields={[{name:'date',label:'Settlement correction date',type:'date'},{name:'reason',label:'Settlement correction evidence'}]} submit={(v,key)=>requestFinance(t.sellerId,'INTERCOMPANY_UNSETTLE',{settlement_id:s.id,date:v.date},v.reason,key)}/>:null}</div>)}
    </article>)}
   </section>:report.isFetching?<p>Checking both source books and intercompany controls…</p>:null}
  </>}
  <FinanceApprovals entityId={entity||undefined}/>
 </div>;
}
