import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppLayout} from '@/components/layout/AppLayout';
import {FinanceActionForm} from '@/components/finance/FinanceActionForm';
import {Evidence,FinanceApprovals} from '@/components/finance/FinanceApprovals';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/useAuth';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {useAccountingPeriods} from '@/hooks/usePeriodClose';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {readAllRows} from '@/lib/readAllRows';
import {closeCheckSchema,closeAttestations} from '@/lib/financeClose';
import {parseTrialBalance} from '@/lib/trialBalance';
import {deriveLedgerStatements} from '@/lib/financeReports';

const attest=(v:Record<string,string>)=>Object.fromEntries(closeAttestations.map(([key])=>[key,v[key]==='on']));
function Attestations(){return <div className="space-y-2">{closeAttestations.map(([key,label])=><label key={key} className="flex gap-2"><input required type="checkbox" name={key}/>{label}</label>)}</div>;}
export default function FinanceClose(){const {user,profile}=useAuth();return <AppLayout title="Financial close" subtitle="Reconciliation checks, independently reviewed periods and fiscal closing"><CloseWorkspace key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function CloseWorkspace(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts(),periods=useAccountingPeriods();const [entity,setEntity]=useState(''),[from,setFrom]=useState(new Date().getUTCFullYear()+'-01-01'),[through,setThrough]=useState(new Date().toISOString().slice(0,10));
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const report=useQuery({queryKey:['finance-close-check',user?.id,profile?.org_id,entity,from,through],enabled:Boolean(user&&profile?.org_id&&entity&&from&&through),retry:false,queryFn:async()=>{
  const result=closeCheckSchema.parse(await financeResult(supabase.rpc('get_finance_close_check',{p_entity:entity,p_from:from,p_through:through})));
  const trial=parseTrialBalance({...result.trialBalance,generatedAt:result.generatedAt},{entityId:entity,fromDate:from,toDate:through});return {...result,income:deriveLedgerStatements(trial).netIncome,currency:trial.currency};
 }});
 const closes=useQuery({queryKey:['fiscal-close-history',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:()=>readAllRows((a,b)=>supabase.from('finance_year_closes').select('*',{count:'exact'}).eq('org_id',profile!.org_id!).order('ends_on',{ascending:false}).order('id').range(a,b))});
 const names=new Map([...(accounts.data??[]).map(a=>[a.id,`${a.code} ${a.name}`] as const),...(entities.data??[]).map(e=>[e.id,e.name] as const)]);
 function exportCheck(){if(!report.data||report.isError)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report.data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`finance-close-${entity}-${through}.json`;a.click();URL.revokeObjectURL(url);}
 return <div className="space-y-6"><p>Resolve ledger variances, unapproved bank statements, due schedules, incomplete usage and pending source decisions. The approver reviews the same dated evidence submitted with the request. Human completeness attestations cover facts that the ledger cannot establish by itself.</p>
  <div className="grid gap-3 sm:grid-cols-3"><label>Close entity<select aria-label="Close entity" className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Choose…</option>{entities.data?.map(e=><option key={e.id} value={e.id}>{e.name} ({e.currency})</option>)}</select></label><label>Close period starts<input aria-label="Close period starts" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="block w-full rounded border bg-background p-2"/></label><label>Close period ends<input aria-label="Close period ends" type="date" value={through} onChange={e=>setThrough(e.target.value)} className="block w-full rounded border bg-background p-2"/></label></div>
  {entities.isError||accounts.isError||periods.isError||closes.isError?<p role="alert">Close setup or history unavailable.</p>:<>
   {report.isError?<p role="alert" className="text-destructive">Close checks unavailable. Previously loaded figures must not be used.</p>:report.data?<section className="space-y-4">
    <h2 className="text-lg font-semibold">{report.data.canClose?'Automated close checks passed.':'Close checks require attention.'}</h2><p>Period net income: {report.data.income} {report.data.currency}</p>
    <div className="grid gap-2 sm:grid-cols-2">{[['Unregistered cash accounts',report.data.unregisteredCashAccounts],['Due schedule postings',report.data.pendingSchedules],['Unfinalized usage cycles',report.data.unfinalizedUsage],['Unrecognized service revenue',report.data.unrecognizedRevenue],['Unresolved provider events',report.data.unresolvedProviderEvents],['Pending finance decisions',report.data.pendingFinanceRequests]].map(([label,value])=><p key={label}>{label}: {value}</p>)}</div>
    {report.data.banks.map(b=><p key={b.registerId}>{b.name}: {b.complete?'Approved through '+b.approvedThrough:'Statement approval required'}</p>)}
    <details><summary>Subledger and control-account evidence</summary><Evidence value={{receivables:report.data.ar,payables:report.data.ap,asset_controls:report.data.assetControls,revenue_controls:report.data.revenueControls,intercompany_controls:report.data.intercompanyControls,statement_controls:report.data.statementControls,customer_credit_controls:report.data.customerCredits} as Json} names={names}/></details>
    <div className="flex gap-2"><Button variant="outline" onClick={()=>void report.refetch()}>Refresh close checks</Button><Button variant="outline" onClick={exportCheck}>Export close evidence</Button></div>
    {profile?.role==='admin'&&report.data.canClose?<details><summary className="font-semibold">Close the fiscal year to retained earnings</summary><FinanceActionForm key={`${entity}:${from}:${through}`} title="Request fiscal year close" fields={[{name:'retained',label:'Retained earnings account',options:accounts.data?.filter(a=>a.is_active&&a.account_type==='equity').map(a=>({value:a.id,label:`${a.code} ${a.name}`}))??[]},{name:'reason',label:'Fiscal close supporting evidence'}]} submit={(v,key)=>requestFinance(entity,'FISCAL_YEAR_CLOSE',{starts_on:from,ends_on:through,retained_account_id:v.retained,attestations:attest(v)},v.reason,key)}><Attestations/></FinanceActionForm><p className="text-sm">The dates must cover configured periods. Closing transfers recorded income and expense balances to retained earnings and soft-closes open periods. Earlier earnings must already be closed.</p></details>:null}
   </section>:report.isFetching?<p>Checking financial sources and ledger balances…</p>:null}
   {entity&&canWrite?<section className="space-y-3"><h2 className="font-semibold">Reviewed period transitions</h2>{periods.data?.filter(p=>p.entity_id===entity&&p.status!=='HARD_CLOSED').map(p=><details key={`${p.id}:${p.version}`}><summary>{p.period_start} — {p.period_end} · {p.status}</summary>
    <FinanceActionForm title="Request period close review" fields={[{name:'status',label:'Period close action',options:p.status==='OPEN'?[{value:'SOFT_CLOSED',label:'Soft close'}]:[{value:'HARD_CLOSED',label:'Permanently close'}]},{name:'reason',label:'Period close supporting evidence'}]} submit={(v,key)=>requestFinance(entity,'PERIOD_REVIEW',{period_id:p.id,expected_version:p.version,status:v.status,attestations:attest(v)},v.reason,key)}><Attestations/></FinanceActionForm>
    {p.status==='SOFT_CLOSED'?<FinanceActionForm title="Request period reopening" fields={[{name:'reason',label:'Period reopening evidence'}]} submit={(v,key)=>requestFinance(entity,'PERIOD_REVIEW',{period_id:p.id,expected_version:p.version,status:'OPEN',attestations:{}},v.reason,key)}/>:null}
   </details>)}</section>:null}
   <section className="space-y-3"><h2 className="font-semibold">Fiscal closing history</h2>{closes.data?.filter(c=>!entity||c.entity_id===entity).map(c=><article className="rounded border p-4 space-y-2" key={c.id}><h3>{names.get(c.entity_id)} · {c.starts_on} — {c.ends_on} · {c.active?'Closed':'Reopened'}</h3><Evidence value={c.lines} names={names}/>
    {profile?.role==='admin'&&c.active?<FinanceActionForm title="Request fiscal reopening" fields={[{name:'reason',label:'Fiscal reopening evidence'}]} submit={(v,key)=>requestFinance(c.entity_id,'FISCAL_YEAR_REOPEN',{close_id:c.id},v.reason,key)}/>:null}
   </article>)}</section>
  </>}
  <FinanceApprovals entityId={entity||undefined}/>
 </div>;
}
