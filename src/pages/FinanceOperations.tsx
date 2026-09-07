import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppLayout} from '@/components/layout/AppLayout';
import {FinanceActionForm} from '@/components/finance/FinanceActionForm';
import {FinanceApprovals,FinancePolicyForm} from '@/components/finance/FinanceApprovals';
import {useAuth} from '@/hooks/useAuth';
import {useReportEntities} from '@/hooks/useTrialBalance';
import {useAccounts} from '@/hooks/useGeneralLedger';
import {requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import {readAllRows} from '@/lib/readAllRows';
import {Button} from '@/components/ui/button';

export default function FinanceOperations(){const {user,profile}=useAuth();return <AppLayout title="Finance operations" subtitle="Journal and payment requests, independent approvals and posting policies"><Operations key={`${user?.id}:${profile?.org_id}`}/></AppLayout>;}
function Operations(){
 const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();const [lines,setLines]=useState([0,1]);
 const canWrite=profile?.role==='admin'||profile?.role==='moderator';
 const sources=useQuery({queryKey:['approval-sources',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:async()=>{
  const org=profile!.org_id!;const [bills,payments,corrections]=await Promise.all([
   readAllRows((from,to)=>supabase.from('bills').select('id,entity_id,bill_number,currency',{count:'exact'}).eq('org_id',org).eq('accounting_status','POSTED').order('id').range(from,to)),
   readAllRows((from,to)=>supabase.from('supplier_payments').select('id,entity_id,payment_number',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
   readAllRows((from,to)=>supabase.from('supplier_payment_corrections').select('id,entity_id,correction_number',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
  ]);return {bills,payments,corrections};
 }});
 return <div className="space-y-6"><FinancePolicyForm/>
  {entities.isError||accounts.isError||sources.isError?<p role="alert" className="text-destructive">Finance setup or source history unavailable.</p>:canWrite?<div className="space-y-4">
   <details><summary className="font-semibold">Prepare a manual journal</summary><FinanceActionForm title="Request manual journal" fields={[
    {name:'entity',label:'Journal entity',options:entities.data?.map(e=>({value:e.id,label:`${e.name} (${e.currency})`}))??[]},{name:'number',label:'Journal number'},{name:'date',label:'Journal date',type:'date'},{name:'memo',label:'Journal memo'},{name:'reason',label:'Journal supporting evidence'},
   ]} submit={(v,key)=>requestFinance(v.entity,'MANUAL_JOURNAL',{number:v.number,date:v.date,memo:v.memo,lines:Object.keys(v).filter(k=>k.startsWith('account-')).map(k=>{const n=k.slice(8);return {account_id:v[k],debit:v['debit-'+n],credit:v['credit-'+n]};})},v.reason,key)}>
    <div className="space-y-2">{lines.map(n=><div key={n} className="grid gap-2 rounded border p-3 sm:grid-cols-4"><label>Account<select aria-label={`Journal line ${n+1} account`} required name={'account-'+n} className="block w-full rounded border bg-background p-2"><option value="">Choose…</option>{accounts.data?.map(a=><option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></label><label>Debit<input aria-label={`Journal line ${n+1} debit`} required name={'debit-'+n} defaultValue="0.00" className="block w-full rounded border bg-background p-2"/></label><label>Credit<input aria-label={`Journal line ${n+1} credit`} required name={'credit-'+n} defaultValue="0.00" className="block w-full rounded border bg-background p-2"/></label>{lines.length>2?<Button type="button" variant="outline" onClick={()=>setLines(lines.filter(x=>x!==n))}>Remove line</Button>:null}</div>)}<Button type="button" variant="outline" disabled={lines.length>=500} onClick={()=>setLines([...lines,Math.max(...lines)+1])}>Add journal line</Button></div>
   </FinanceActionForm></details>
   <details><summary className="font-semibold">Prepare a supplier payment</summary><FinanceActionForm title="Request supplier payment" fields={[
    {name:'bill',label:'Supplier bill',options:sources.data?.bills.map(b=>({value:b.id,label:`${b.bill_number} (${b.currency})`}))??[]},{name:'number',label:'Payment number'},{name:'date',label:'Payment date',type:'date'},{name:'amount',label:'Payment amount'},{name:'reference',label:'Settlement reference'},{name:'reason',label:'Payment evidence'},
   ]} submit={(v,key)=>{const bill=sources.data?.bills.find(b=>b.id===v.bill);if(!bill)throw new Error('Bill unavailable.');return requestFinance(bill.entity_id,'SUPPLIER_PAYMENT',{bill_id:bill.id,number:v.number,date:v.date,amount:v.amount,reference:v.reference},v.reason,key);}}/>
   <p className="text-sm">This records the accounting allocation. It does not send money. The approved amount must fit the bill's available balance on every accounting date.</p></details>
   {(['CORRECTION','REPLACEMENT'] as const).map(kind=><details key={kind}><summary className="font-semibold">Request payment {kind.toLowerCase()}</summary><FinanceActionForm title={`Request payment ${kind.toLowerCase()}`} fields={[
    {name:'source',label:kind==='CORRECTION'?'Original payment':'Original payment correction',options:kind==='CORRECTION'?sources.data?.payments.map(p=>({value:p.id,label:p.payment_number}))??[]:sources.data?.corrections.map(p=>({value:p.id,label:p.correction_number}))??[]},
    {name:'number',label:'Accounting document number'},{name:'date',label:'Accounting date',type:'date'},{name:'reference',label:'Correction or replacement reference'},{name:'reason',label:'Supporting evidence'},
   ]} submit={(v,key)=>{const source=(kind==='CORRECTION'?sources.data?.payments:sources.data?.corrections)?.find(s=>s.id===v.source);if(!source)throw new Error('Source unavailable.');return requestFinance(source.entity_id,'SUPPLIER_PAYMENT_'+kind,{source_id:source.id,number:v.number,date:v.date,reference:v.reference},v.reason,key);}}/></details>)}
  </div>:null}
  <FinanceApprovals/>
 </div>;
}
