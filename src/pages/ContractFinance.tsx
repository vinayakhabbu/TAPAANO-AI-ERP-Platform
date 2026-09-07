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
import {contractFinanceSchema,type ContractFinance as Report} from '@/lib/contractFinance';
import {Button} from '@/components/ui/button';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';

export default function ContractFinance(){const {user,profile}=useAuth();return <AppLayout title="Contracts, billing and revenue" subtitle="Approved terms, traceable invoices and earned revenue"><ContractEditor key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function ContractEditor(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [selected,setSelected]=useState(''),[asOf,setAsOf]=useState(new Date().toISOString().slice(0,10)),[obligations,setObligations]=useState([0]);
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const history=useQuery({queryKey:['contracts',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:async()=>{
  const org=profile!.org_id!;const [contracts,customers]=await Promise.all([
   readAllRows((from,to)=>supabase.from('finance_contracts').select('*',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
   readAllRows((from,to)=>supabase.from('customers').select('id,name',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
  ]);return {contracts,customers};
 }});
 const report=useQuery({queryKey:['contract-finance',user?.id,profile?.org_id,selected,asOf],enabled:Boolean(selected&&asOf&&user&&profile?.org_id),retry:false,queryFn:async()=>{
  const data=contractFinanceSchema.parse(await financeResult(supabase.rpc('get_contract_finance',{p_contract_id:selected,p_as_of:asOf})));if(data.id!==selected||data.asOf!==asOf)throw new Error('Contract report scope changed.');return data;
 }});
 return <div className="space-y-6"><p>Approve the contract and its performance obligations before billing. Fixed subscriptions recognize service by day; milestones require transfer evidence. Usage is finalized against a source control total and billed in arrears. Revenue earned before invoicing is recorded as an unbilled receivable.</p>
  <p className="text-sm text-muted-foreground">Current billing uses the entity's functional currency and zero-tax invoice workflow. Customer tax treatment, variable consideration, contract modifications and revenue policy require finance acceptance. Forecast schedules do not post revenue.</p>
  {history.isError||entities.isError||accounts.isError?<p role="alert" className="text-destructive">Contract history or account setup unavailable.</p>:canWrite?<details><summary className="cursor-pointer font-semibold">Create a contract</summary><FinanceActionForm title="Request contract approval" fields={[
   {name:'entity',label:'Legal entity',options:entities.data?.map(e=>({value:e.id,label:`${e.name} (${e.currency})`}))??[]},
   {name:'customer',label:'Customer',options:history.data?.customers.map(c=>({value:c.id,label:c.name}))??[]},
   {name:'reference',label:'Contract reference'},{name:'kind',label:'Contract pricing',value:'FIXED',options:[{value:'FIXED',label:'Fixed subscription or service'},{value:'USAGE',label:'Usage in arrears'}]},
   {name:'starts_on',label:'Service starts',type:'date'},{name:'ends_on',label:'Service ends',type:'date'},
   {name:'months',label:'Billing frequency',value:'1',options:[{value:'0',label:'Once for the contract'},{value:'1',label:'Monthly'},{value:'3',label:'Quarterly'},{value:'12',label:'Annually'}]},
   {name:'price',label:'Fixed price per billing cycle',value:'0.00'},{name:'unit_price',label:'Usage price per unit',value:'0.00'},
   {name:'timezone',label:'Usage accounting timezone',value:'America/New_York'},
   {name:'deferred',label:'Deferred revenue liability',options:accounts.data?.filter(a=>a.account_type==='liability').map(a=>({value:a.id,label:`${a.code} ${a.name}`}))??[]},
   {name:'unbilled',label:'Unbilled receivable asset',options:accounts.data?.filter(a=>a.account_type==='asset').map(a=>({value:a.id,label:`${a.code} ${a.name}`}))??[]},
   {name:'reason',label:'Contract and accounting policy evidence'},
  ]} submit={(v,key)=>requestFinance(v.entity,'CONTRACT_CREATE',{customer_id:v.customer,reference:v.reference,kind:v.kind,starts_on:v.starts_on,ends_on:v.ends_on,cycle_months:Number(v.months),price:v.price,unit_price:v.unit_price,timezone:v.timezone,deferred_account_id:v.deferred,unbilled_account_id:v.unbilled,
   obligations:Object.keys(v).filter(k=>k.startsWith('obligation-key-')).map(k=>{const n=k.slice('obligation-key-'.length);return {key:v[k],description:v['obligation-description-'+n],standalone_price:v['obligation-price-'+n],method:v['obligation-method-'+n]};})},v.reason,key)}>
   <div className="space-y-3"><h3 className="font-semibold">Performance obligations</h3><p className="text-sm">The transaction price is allocated by relative standalone selling price. Usage contracts use one usage obligation.</p>{obligations.map(n=><div key={n} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
    <label>Obligation reference<input aria-label={`Obligation ${n+1} reference`} name={`obligation-key-${n}`} required className="block w-full rounded border bg-background p-2"/></label>
    <label>Description<input aria-label={`Obligation ${n+1} description`} name={`obligation-description-${n}`} required className="block w-full rounded border bg-background p-2"/></label>
    <label>Standalone selling price<input aria-label={`Obligation ${n+1} standalone price`} name={`obligation-price-${n}`} required inputMode="decimal" className="block w-full rounded border bg-background p-2"/></label>
    <label>Recognition method<select aria-label={`Obligation ${n+1} method`} name={`obligation-method-${n}`} className="block w-full rounded border bg-background p-2"><option value="DAILY">Daily service</option><option value="MILESTONE">Milestone on transfer</option><option value="USAGE">Usage consumed</option></select></label>
    {obligations.length>1?<Button type="button" variant="outline" onClick={()=>setObligations(obligations.filter(i=>i!==n))}>Remove obligation {n+1}</Button>:null}
   </div>)}<Button type="button" variant="outline" disabled={obligations.length>=20} onClick={()=>setObligations([...obligations,Math.max(...obligations)+1])}>Add obligation</Button></div>
  </FinanceActionForm></details>:null}
  <div className="grid gap-3 sm:grid-cols-2"><label>Contract<select aria-label="Contract" className="block w-full rounded border bg-background p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose…</option>{history.data?.contracts.map(c=><option key={c.id} value={c.id}>{c.reference} ({c.currency})</option>)}</select></label><label>Report as of<input aria-label="Contract report as of" type="date" className="block w-full rounded border bg-background p-2" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label></div>
  {report.isError?<p role="alert" className="text-destructive">Contract report unavailable. Do not use previously loaded balances.</p>:report.data?<ContractDetail report={report.data} canWrite={canWrite}/>:report.isFetching?<p>Reconciling contract records…</p>:null}
  <FinanceApprovals entityId={report.data?.entityId}/>
 </div>;
}
function ContractDetail({report:r,canWrite}:{report:Report;canWrite:boolean}){
 return <section className="space-y-5"><h2 className="text-lg font-semibold">{r.reference} · {r.currency} · as of {r.asOf}</h2><dl className="grid gap-3 sm:grid-cols-4">{[['Net billed',r.billed],['Recognized revenue',r.recognized],['Deferred revenue',r.deferred],['Unbilled receivable',r.unbilled]].map(([label,value])=><div key={label} className="rounded border p-3"><dt>{label}</dt><dd className="font-mono">{value}</dd></div>)}</dl>
  <h3 className="font-semibold">Entity revenue control accounts</h3><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>All contracts</TableHead><TableHead>GL balance</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader><TableBody>{r.controls.map(a=><TableRow key={a.accountId}><TableCell>{a.code} {a.name}</TableCell><TableCell>{a.expected}</TableCell><TableCell>{a.ledger}</TableCell><TableCell>{a.variance}</TableCell></TableRow>)}</TableBody></Table>{r.controls.some(a=>a.variance!=="0.00")?<p role="alert" className="text-destructive">Revenue control accounts do not reconcile. Investigate manual entries and opening balances before close.</p>:<p>Revenue control accounts reconcile to the ledger.</p>}
  {canWrite?<details><summary>Prospective contract amendment</summary><FinanceActionForm title="Request contract amendment" fields={[
   {name:'cycle',label:'Effective billing cycle',options:r.cycles.filter(c=>!c.billingRequest&&!c.cancelled&&!c.recognitions.length&&!c.usage.count).map(c=>({value:String(c.number),label:`Cycle ${c.number}: ${c.startsOn}`}))},
   {name:'action',label:'Amendment',options:[{value:'REPRICE',label:'Change fixed cycle price'},{value:'CANCEL',label:'Cancel remaining cycles'}]},{name:'price',label:'New cycle price (repricing only)',value:'0.00'},{name:'reason',label:'Amendment evidence'},
  ]} submit={(v,key)=>requestFinance(r.entityId,'CONTRACT_AMEND',{contract_id:r.id,effective_cycle:Number(v.cycle),action:v.action,new_price:v.price},v.reason,key)}/></details>:null}
  {r.cycles.map(c=><details key={c.id} className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Cycle {c.number} · {c.startsOn} to {c.endsOn} · {c.price} {r.currency} · {c.cancelled?'Cancelled':c.creditId?'Credited':c.billingRequest?'Billed':'Unbilled'}</summary><div className="mt-4 space-y-4">
   <p>Recognized {c.recognized} · Deferred {c.deferred} · Unbilled receivable {c.unbilled}</p>
   <Table><TableHeader><TableRow><TableHead>Obligation</TableHead><TableHead>Method</TableHead><TableHead>Allocated price</TableHead></TableRow></TableHeader><TableBody>{c.allocations.map(a=><TableRow key={a.key}><TableCell>{a.description}</TableCell><TableCell>{a.method}</TableCell><TableCell className="font-mono">{a.amount}</TableCell></TableRow>)}</TableBody></Table>
   <details><summary>Recognition schedule (cumulative service earned)</summary><Table><TableHeader><TableRow><TableHead>Through</TableHead>{c.allocations.map(a=><TableHead key={a.key}>{a.description}</TableHead>)}</TableRow></TableHeader><TableBody>{c.schedule.map(s=><TableRow key={s.through}><TableCell>{s.through}</TableCell>{c.allocations.map(a=><TableCell key={a.key} className="font-mono">{s.cumulativeEarned?.find(e=>e.key===a.key)?.amount??'Usage not finalized'}</TableCell>)}</TableRow>)}</TableBody></Table><p className="text-sm">Milestones enter the schedule when approved transfer evidence is recorded. Forecast service dates do not authorize posting.</p></details>
   {c.recognitions.length?<Table><TableHeader><TableRow><TableHead>Recognition date</TableHead><TableHead>Amount</TableHead><TableHead>Journal reference</TableHead></TableRow></TableHeader><TableBody>{c.recognitions.map(e=><TableRow key={e.id}><TableCell>{e.date}</TableCell><TableCell className="font-mono">{e.amount}</TableCell><TableCell>{e.journalId}</TableCell></TableRow>)}</TableBody></Table>:null}
   {canWrite&&!c.cancelled&&!c.creditId?<div className="grid gap-4 lg:grid-cols-2">
    {r.terms.kind==='USAGE'&&!c.usageFinalized?<><FinanceActionForm title="Record usage event" fields={[
      {name:'source',label:'Usage source'},{name:'external',label:'Source event ID'},{name:'time',label:'Event timestamp with timezone',value:c.startsOn+'T12:00:00Z'},{name:'units',label:'Exact usage quantity'},{name:'correction',label:'Original event ID for an exact correction',optional:true},
    ]} submit={v=>financeResult(supabase.rpc('record_contract_usage',{p_contract_id:r.id,p_source:v.source,p_external_id:v.external,p_occurred_at:v.time,p_units:v.units,p_correction_of:v.correction||null}))}/>
    <FinanceActionForm key={c.usage.revision} title="Request usage finalization" fields={[{name:'units',label:'Source control total (units)'},{name:'reason',label:'Source completeness evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CONTRACT_USAGE_CLOSE',{cycle_id:c.id,revision:c.usage.revision,expected_units:v.units},v.reason,key)}><p>{c.usage.count} recorded events · Net usage {c.usage.units} · {r.terms.timezone}</p></FinanceActionForm></>:null}
    {c.usageFinalized&&!c.billingRequest?<FinanceActionForm title="Request billing" fields={[{name:'number',label:'Invoice number'},{name:'date',label:'Invoice date',type:'date'},{name:'due',label:'Invoice due date',type:'date'},{name:'reason',label:'Billing evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CONTRACT_BILL',{cycle_id:c.id,number:v.number,issue_date:v.date,due_date:v.due},v.reason,key)}/>:null}
    {c.usageFinalized?<FinanceActionForm title="Request revenue recognition" fields={[{name:'date',label:'Recognize service through',type:'date'},{name:'reason',label:'Revenue recognition evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CONTRACT_RECOGNIZE',{cycle_id:c.id,as_of:v.date,evidence:c.allocations.filter(a=>a.method==='MILESTONE'&&v['satisfied-'+a.key]).map(a=>({key:a.key,satisfied_on:v['satisfied-'+a.key],reference:v['evidence-'+a.key]}))},v.reason,key)}>
      {c.allocations.filter(a=>a.method==='MILESTONE').map(a=><div key={a.key} className="grid gap-2 sm:grid-cols-2"><label>{a.description} transferred on<input type="date" name={'satisfied-'+a.key} className="block w-full rounded border bg-background p-2"/></label><label>{a.description} acceptance evidence<input name={'evidence-'+a.key} className="block w-full rounded border bg-background p-2"/></label></div>)}
    </FinanceActionForm>:null}
    {c.invoiceId?<FinanceActionForm title="Request full contract credit" fields={[{name:'number',label:'Credit note number'},{name:'date',label:'Credit date',type:'date'},{name:'reason',label:'Credit evidence'}]} submit={(v,key)=>requestFinance(r.entityId,'CONTRACT_CREDIT',{cycle_id:c.id,number:v.number,date:v.date},v.reason,key)}/>:null}
   </div>:null}
  </div></details>)}
  <Button variant="outline" onClick={()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=`contract-${r.id}-${r.asOf}.json`;a.click();URL.revokeObjectURL(u);}}>Export contract and revenue evidence</Button>
 </section>;
}
