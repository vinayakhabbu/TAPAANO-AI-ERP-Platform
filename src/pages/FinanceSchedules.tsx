import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppLayout} from '@/components/layout/AppLayout';
import {FinanceActionForm} from '@/components/finance/FinanceActionForm';
import {FinanceJournalLines} from '@/components/finance/FinanceJournalLines';
import {Evidence,FinanceApprovals} from '@/components/finance/FinanceApprovals';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/useAuth';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {readAllRows} from '@/lib/readAllRows';
import {acquisitionSchema,scheduleSchema,journalLinesFromValues,type FinanceSchedule} from '@/lib/financeClose';

export default function FinanceSchedules(){const {user,profile}=useAuth();return <AppLayout title="Finance schedules" subtitle="Prepaids, fixed assets, recurring journals and accrual reversals"><ScheduleWorkspace key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function ScheduleWorkspace(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [entity,setEntity]=useState(''),[kind,setKind]=useState('PREPAID'),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[asOf,setAsOf]=useState(new Date().toISOString().slice(0,10));
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const history=useQuery({queryKey:['finance-schedules',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:()=>readAllRows((a,b)=>supabase.from('finance_schedules').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).order('id').range(a,b))});
 const acquisitions=useQuery({queryKey:['schedule-acquisitions',user?.id,profile?.org_id,entity,search],enabled:Boolean(user&&profile?.org_id&&entity&&canWrite),queryFn:({signal})=>financeResult(supabase.rpc('get_schedule_acquisitions',{p_entity:entity,p_search:search}).abortSignal(signal)).then(data=>acquisitionSchema.parse(data))});
 const report=useQuery({queryKey:['finance-schedule-report',user?.id,profile?.org_id,selected,asOf],enabled:Boolean(user&&profile?.org_id&&selected&&asOf),retry:false,queryFn:()=>financeResult(supabase.rpc('get_finance_schedule',{p_schedule:selected,p_as_of:asOf})).then(data=>scheduleSchema.parse(data))});
 const names=new Map((accounts.data??[]).map(a=>[a.id,`${a.code} ${a.name}`]));const options=(type:string)=>(accounts.data??[]).filter(a=>a.is_active&&a.account_type===type).map(a=>({value:a.id,label:`${a.code} ${a.name}`}));
 return <div className="space-y-6"><p>Link an existing acquisition to its approved expense policy, or prepare a recurring journal. Every run and correction requires an independent reviewer. Amounts use cumulative allocation with exact cents; a registration does not create a second purchase.</p>
  <div className="grid gap-3 sm:grid-cols-2"><label>Schedule entity<select aria-label="Schedule entity" className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>{setEntity(e.target.value);setSelected('');}}><option value="">Choose…</option>{entities.data?.map(e=><option key={e.id} value={e.id}>{e.name} ({e.currency})</option>)}</select></label><label>Schedule report as of<input aria-label="Schedule report as of" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="block w-full rounded border bg-background p-2"/></label></div>
  {entities.isError||accounts.isError||history.isError?<p role="alert">Schedule setup or history unavailable.</p>:<>
   {entity&&canWrite?<details><summary className="font-semibold">Create a finance schedule</summary><label>Schedule type<select aria-label="Schedule type" className="block w-full rounded border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value)}>{[['PREPAID','Prepaid expense'],['FIXED_ASSET','Fixed asset'],['RECURRING','Recurring journal'],['ACCRUAL','Accrual with reversal']].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    {kind==='PREPAID'||kind==='FIXED_ASSET'?<div className="space-y-3"><label>Find acquisition<input aria-label="Find acquisition" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} className="block w-full rounded border bg-background p-2" placeholder="Journal number or asset account"/></label>{acquisitions.isError?<p role="alert">Acquisition source search unavailable.</p>:<>
     {acquisitions.data?.hasMore?<p>More than 200 acquisitions match. Narrow the journal or account search.</p>:null}
     <FinanceActionForm key={`${entity}:${kind}`} title="Request asset schedule" fields={[
      {name:'reference',label:'Schedule reference'},{name:'source',label:'Acquisition journal debit',options:acquisitions.data?.rows.map(a=>({value:a.id,label:`${a.journal} · ${a.code} ${a.name} · ${a.cost}`}))??[]},
      {name:'start',label:'Service or in-service date',type:'date'},{name:'end',label:'Final service or useful-life date',type:'date'},
      {name:'expense',label:'Expense account',options:options('expense')},...(kind==='FIXED_ASSET'?[{name:'accumulated',label:'Accumulated depreciation account',options:options('asset')},{name:'salvage',label:'Residual value',value:'0.00'}]:[]),{name:'reason',label:'Acquisition and useful-life evidence'},
     ]} submit={(v,key)=>requestFinance(entity,'SCHEDULE_CREATE',{reference:v.reference,kind,starts_on:v.start,ends_on:v.end,source_line_id:v.source,salvage:kind==='FIXED_ASSET'?v.salvage:'0.00',expense_account_id:v.expense,...(kind==='FIXED_ASSET'?{accumulated_account_id:v.accumulated}:{})},v.reason,key)}/>
     <p className="text-sm">The policy allocates cost less residual value by actual service days. Finance must approve the useful life and residual value. This is book depreciation; tax depreciation is a separate calculation.</p>
    </>}</div>:<FinanceActionForm key={`${entity}:${kind}`} title="Request recurring schedule" fields={[
     {name:'reference',label:'Schedule reference'},{name:'start',label:'First posting date',type:'date'},{name:'end',label:kind==='ACCRUAL'?'Accrual reversal date':'Final occurrence date',type:'date'},
     ...(kind==='RECURRING'?[{name:'months',label:'Journal frequency',value:'1',options:[{value:'1',label:'Monthly'},{value:'3',label:'Quarterly'},{value:'12',label:'Annually'}]}]:[]),{name:'reason',label:'Recurring journal supporting evidence'},
    ]} submit={(v,key)=>requestFinance(entity,'SCHEDULE_CREATE',{reference:v.reference,kind,starts_on:v.start,ends_on:v.end,lines:journalLinesFromValues(v),...(kind==='RECURRING'?{cycle_months:Number(v.months)}:{})},v.reason,key)}><FinanceJournalLines accounts={accounts.data?.filter(a=>a.is_active)??[]}/></FinanceActionForm>}
   </details>:null}
   <label>Schedule<select aria-label="Schedule" className="block w-full rounded border bg-background p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose…</option>{history.data?.filter(s=>s.entity_id===entity).map(s=><option key={s.id} value={s.id}>{s.reference} · {s.kind} · {s.state}</option>)}</select></label>
   {report.isError?<p role="alert" className="text-destructive">Schedule report unavailable. Previously loaded balances must not be used.</p>:report.data?<ScheduleDetail key={selected} report={report.data} names={names} canWrite={canWrite} options={options}/>:report.isFetching?<p>Validating schedule and ledger evidence…</p>:null}
  </>}
  <FinanceApprovals entityId={entity||undefined}/>
 </div>;
}
function ScheduleDetail({report:r,names,canWrite,options}:{report:FinanceSchedule;names:Map<string,string>;canWrite:boolean;options:(type:string)=>{value:string;label:string}[]}){
 const exportReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`schedule-${r.id}-${r.asOf}.json`;a.click();URL.revokeObjectURL(url);};
 return <section className="space-y-4"><h2 className="text-lg font-semibold">{r.reference} · {r.state}</h2>{r.cost!==null?<p>Linked cost {r.cost} · Expense recognized {r.expensed} · Carrying value {r.carryingValue} {r.currency} as of {r.asOf}</p>:null}
  {r.controls.some(c=>c.variance!=='0.00')?<p role="alert">Asset control accounts have ledger variances. Resolve them before closing.</p>:<p>Asset schedule controls reconcile to the ledger.</p>}{r.controls.map(c=><p key={c.accountId}>{names.get(c.accountId)} · Scheduled {c.expected} · Ledger {c.ledger} · Variance {c.variance}</p>)}
  <Button variant="outline" onClick={exportReport}>Export schedule evidence</Button>
  <details><summary>Approved terms and original allocation calendar</summary><Evidence value={r.terms as Json} names={names}/><Evidence value={r.projection as Json} names={names}/></details>
  {canWrite&&r.state==='ACTIVE'?<div className="space-y-3"><FinanceActionForm title="Request schedule posting" fields={[{name:'date',label:'Post schedule through',type:'date',value:r.asOf},{name:'reason',label:'Schedule run evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'SCHEDULE_RUN',{schedule_id:r.id,date:v.date},v.reason,key)}/>
   {r.kind==='PREPAID'||r.kind==='FIXED_ASSET'?<details><summary>Dispose or terminate this asset</summary><FinanceActionForm title="Request asset disposal" fields={[{name:'date',label:'Disposal date',type:'date'},{name:'proceeds',label:'Disposal proceeds',value:'0.00'},{name:'proceeds_account',label:'Proceeds account',optional:true,options:options('asset')},{name:'gain',label:'Gain account',options:options('revenue')},{name:'loss',label:'Loss or write-off account',options:options('expense')},{name:'reason',label:'Disposal evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'ASSET_DISPOSE',{schedule_id:r.id,date:v.date,proceeds:v.proceeds,proceeds_account_id:v.proceeds_account||null,gain_account_id:v.gain,loss_account_id:v.loss},v.reason,key)}/></details>:null}
   <details><summary>Cancel an unused registration or future recurrence</summary><FinanceActionForm title="Request schedule cancellation" fields={[{name:'reason',label:'Cancellation evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'SCHEDULE_CANCEL',{schedule_id:r.id},v.reason,key)}/><p className="text-sm">Assets with postings and outstanding accruals cannot be cancelled. Resolve overdue recurring entries first. Cancelling an unused asset registration leaves its acquisition journal for separate correction or reassignment.</p></details>
  </div>:null}
  {r.entries.map(e=><article className="rounded border p-3 space-y-2" key={e.id}><h3 className="font-semibold">{e.kind} · {e.date}{['EXPENSE','DISPOSAL'].includes(e.kind)?` · ${e.amount} ${r.currency}`:''}</h3><Evidence value={e.details as Json} names={names}/>{e.reversedOn?<p>Reversed on {e.reversedOn}</p>:null}
   {canWrite&&!e.reversalId&&r.state==='ACTIVE'&&['EXPENSE','RECURRING'].includes(e.kind)?<details><summary>Correct this schedule entry</summary><FinanceActionForm title="Request schedule correction" fields={[{name:'date',label:'Correction date',type:'date'},{name:'reason',label:'Schedule correction evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'SCHEDULE_CORRECT',{schedule_id:r.id,entry_id:e.id,date:v.date},v.reason,key)}/></details>:null}
   {canWrite&&!e.reversalId&&r.state==='DISPOSED'&&e.kind==='DISPOSAL'?<FinanceActionForm title="Request disposal restoration" fields={[{name:'reason',label:'Disposal restoration evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'ASSET_RESTORE',{schedule_id:r.id,date:e.date},v.reason,key)}/>:null}
  </article>)}
 </section>;
}
