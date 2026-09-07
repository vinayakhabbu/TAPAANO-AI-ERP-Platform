import {useState} from 'react';
import {useAuth} from '@/hooks/useAuth';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {financeResult,requestFinance,useFinanceApprovals} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import {FinanceActionForm} from './FinanceActionForm';
import {Button} from '@/components/ui/button';
import type {Json} from '@/integrations/supabase/types';

const labels:Record<string,string>={MANUAL_JOURNAL:'Manual journal',SUPPLIER_PAYMENT:'Supplier payment',APPROVAL_POLICY:'Posting approval policy',CONTRACT_CREATE:'Contract approval',CONTRACT_BILL:'Contract invoice',CONTRACT_RECOGNIZE:'Revenue recognition',CONTRACT_USAGE_CLOSE:'Usage completeness review',CONTRACT_CREDIT:'Contract credit',CONTRACT_AMEND:'Contract amendment'};
function Evidence({value,names}:{value:Json;names:Map<string,string>}){
 if(value===null||value===undefined)return <span>—</span>;
 if(Array.isArray(value))return <ul className="space-y-2">{value.map((v,i)=><li key={i} className="rounded border p-2"><Evidence value={v} names={names}/></li>)}</ul>;
 if(typeof value==='object')return <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(value).map(([k,v])=><div key={k}><dt className="text-sm text-muted-foreground">{k.replace(/_/g,' ')}</dt><dd><Evidence value={v??null} names={names}/></dd></div>)}</dl>;
 return <span className="break-words">{typeof value==='string'?(names.get(value)??value):String(value)}</span>;
}
export function FinanceApprovals({entityId}:{entityId?:string}){
 const {user,profile}=useAuth(),history=useFinanceApprovals(),entities=useReportEntities(),accounts=useAccounts();
 const [showAll,setShowAll]=useState(false);const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const names=new Map([...(entities.data??[]).map(x=>[x.id,x.name] as const),...(accounts.data??[]).map(x=>[x.id,`${x.code} ${x.name}`] as const)]);
 const requests=history.data?.requests.filter(r=>(!entityId||r.entity_id===entityId)&&(showAll||r.state==='PENDING'))??[];
 return <section className="space-y-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Finance approvals</h2><Button variant="outline" onClick={()=>void history.refetch()}>Refresh approvals</Button><label className="text-sm"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> Include decided requests</label></div>
  <p className="text-sm">Review the proposed financial effect and source evidence. Approval rechecks the current records and posts the full transaction atomically. The requester cannot approve their own action.</p>
  {history.isError?<p role="alert" className="text-destructive">Approval history unavailable. Do not infer an empty queue.</p>:history.isFetching?<p>Loading approval history…</p>:requests.length===0?<p>No requests in this view.</p>:requests.map(r=><article key={r.id} className="space-y-3 rounded-lg border p-4">
   <h3 className="font-semibold">{labels[r.kind]??r.kind} · {names.get(r.entity_id)??r.entity_id} · {r.state}</h3><p>{r.reason}</p><p className="text-xs">Requested {r.requested_at} by {r.requested_by}</p>
   <Evidence value={r.payload} names={names}/>
   {r.source_snapshot&&JSON.stringify(r.source_snapshot)!=='{}'?<div><h4 className="font-semibold">Financial figures submitted for approval</h4><Evidence value={r.source_snapshot} names={names}/></div>:null}
   {r.state==='PENDING'&&canWrite?<FinanceActionForm title={r.requested_by===user?.id?'Withdraw request':'Decide finance request'} fields={[
    {name:'decision',label:'Decision',options:r.requested_by===user?.id?[{value:'WITHDRAW',label:'Withdraw'}]:[{value:'APPROVE',label:'Approve and execute'},{value:'REJECT',label:'Reject'}]},
    {name:'reason',label:'Decision evidence'},
   ]} submit={v=>financeResult(supabase.rpc('decide_finance_action',{p_request_id:r.id,p_decision:v.decision,p_reason:v.reason}))}/>:r.state!=='PENDING'?<div><p>{r.decision_reason} · {r.decided_at}</p><Evidence value={r.result} names={names}/></div>:null}
  </article>)}
 </section>;
}
export function FinancePolicyForm(){
 const {user,profile}=useAuth(),entities=useReportEntities(),history=useFinanceApprovals();const [entity,setEntity]=useState('');
 if(profile?.role!=='admin')return null;
 const policy=history.data?.policies.find(p=>p.entity_id===entity);
 return <section className="space-y-3"><h2 className="text-lg font-semibold">Posting approval policy</h2><p>Enable independent review for manual journals and supplier payments before customer onboarding. Existing entities retain their current posting behavior until this policy is approved. Policy changes also require a second administrator.</p>
  <label>Policy entity<select className="block w-full rounded border bg-background p-2" value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Choose…</option>{entities.data?.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
  {history.isError||entities.isError?<p role="alert">Policy setup unavailable.</p>:entity?<FinanceActionForm key={`${user?.id}:${entity}:${policy?.version??0}`} title="Request approval policy" fields={[
   {name:'journals',label:'Manual journals',value:String(policy?.journals_required??true),options:[{value:'true',label:'Independent approval required'},{value:'false',label:'Direct operator posting allowed'}]},
   {name:'payments',label:'Supplier payments',value:String(policy?.payments_required??true),options:[{value:'true',label:'Independent approval required'},{value:'false',label:'Direct operator posting allowed'}]},
   {name:'reason',label:'Policy change reason'},
  ]} submit={(v,key)=>requestFinance(entity,'APPROVAL_POLICY',{journals_required:v.journals==='true',payments_required:v.payments==='true',expected_version:policy?.version??0},v.reason,key)}/>:null}
 </section>;
}
