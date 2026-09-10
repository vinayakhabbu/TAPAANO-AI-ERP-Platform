import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useReportEntities } from '@/hooks/useTrialBalance';
import { useAccounts } from '@/hooks/useGeneralLedger';
import { readAllRows } from '@/lib/readAllRows';
import { cashReportSchema, parseBankCsv, type CashReport } from '@/lib/cashReconciliation';
import { FinanceActionForm } from './FinanceActionForm';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

async function checked<T>(result:PromiseLike<{data:T;error:unknown}>){const r=await result;if(r.error)throw r.error;return r.data;}
export function CashWorkspace() {
  const {user,profile}=useAuth();
  return <CashEditor key={`${user?.id}:${profile?.org_id}`}/>;
}
function CashEditor() {
  const {user,profile}=useAuth(),entities=useReportEntities(),accounts=useAccounts();
  const [statement,setStatement]=useState(()=>new URLSearchParams(window.location.search).get('statement')??''),[csv,setCsv]=useState(''),[fileError,setFileError]=useState('');
  const canWrite=profile?.role==='admin'||profile?.role==='moderator';
  const history=useQuery({queryKey:['cash-history',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:async()=>{
    const org=profile!.org_id!;
    const [registers,statements,reviews]=await Promise.all([
      readAllRows((from,to)=>supabase.from('cash_registers').select('*',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
      readAllRows((from,to)=>supabase.from('cash_statements').select('id,org_id,register_id,reference,starts_on,ends_on,status,imported_by,created_at',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
      readAllRows((from,to)=>supabase.from('cash_reviews').select('*',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
    ]);return {registers,statements,reviews};
  }});
  const report=useQuery({queryKey:['cash-reconciliation',user?.id,profile?.org_id,statement],enabled:Boolean(statement&&user&&profile?.org_id),retry:false,
    queryFn:async()=>{const parsed=cashReportSchema.parse(await checked(supabase.rpc('get_cash_reconciliation',{p_statement_id:statement})));if(parsed.id!==statement)throw new Error('Statement scope changed.');return parsed;}});
  const selectedReviews=history.data?.reviews.filter(x=>x.statement_id===statement)??[];
  return <section className="space-y-5">
    <p>Import a bank statement, match its transactions to posted cash entries, and submit the reconciliation for independent review. Record missing fees or interest through <Link className="underline" to="/gl">General Ledger</Link>. Outstanding book entries carry forward until they clear.</p>
    <p className="text-sm text-muted-foreground">CSV amounts are positive for money received and negative for money paid. Use stable bank transaction IDs and ISO dates. The first opening bank balance must reconcile to the opening cash ledger. Bank payments and live feeds require a configured provider.</p>
    {(history.isError||entities.isError||accounts.isError)?<p role="alert" className="text-destructive">Banking history or setup is unavailable. Refresh before continuing.</p>:null}
    {history.isPending?<p>Loading banking history…</p>:null}
    {canWrite&&!history.isError&&!entities.isError&&!accounts.isError?<div className="grid gap-4 lg:grid-cols-2">
      <FinanceActionForm title="Create cash register" fields={[
        {name:'entity',label:'Legal entity',options:entities.data?.map(x=>({value:x.id,label:`${x.name} (${x.currency})`}))??[]},
        {name:'account',label:'Cash GL account',options:accounts.data?.filter(x=>x.account_type==='asset').map(x=>({value:x.id,label:`${x.code} ${x.name}`}))??[]},
        {name:'name',label:'Register name'},
      ]} submit={v=>checked(supabase.rpc('create_cash_register',{p_entity_id:v.entity,p_account_id:v.account,p_name:v.name}))}/>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Upload statement CSV<input aria-label="Upload statement CSV" type="file" accept=".csv,text/csv" className="block w-full p-2" onChange={async e=>{
          const file=e.target.files?.[0];if(!file)return;try{if(file.size>2_000_000)throw new Error('Statement exceeds 2 MB.');const text=await file.text();parseBankCsv(text);setCsv(text);setFileError('');}catch(e){setFileError(e instanceof Error?e.message:'File unavailable.');}
        }}/></label>
        {fileError?<p role="alert" className="text-destructive">{fileError}</p>:null}
        <FinanceActionForm key={csv} title="Import bank statement" fields={[
          {name:'register',label:'Cash register',options:history.data?.registers.map(x=>({value:x.id,label:`${x.name} (${x.currency})`}))??[]},
          {name:'reference',label:'Statement reference'},{name:'from',label:'Statement starts',type:'date'},{name:'through',label:'Statement ends',type:'date'},
          {name:'opening',label:'Opening bank balance'},{name:'closing',label:'Closing bank balance'},
          {name:'csv',label:'CSV: external_id,booked_on,description,reference,amount',type:'textarea',value:csv},
        ]} submit={async(v,key)=>{const id=await checked(supabase.rpc('import_cash_statement',{p_register_id:v.register,p_key:key,p_statement:{reference:v.reference,starts_on:v.from,ends_on:v.through,opening:v.opening,closing:v.closing,lines:parseBankCsv(v.csv)}}));if(id)setStatement(id);}}/>
      </div>
    </div>:null}
    {!history.isError?<label className="block space-y-1">Statement<select aria-label="Statement" className="block w-full rounded border bg-background p-2" value={statement} onChange={e=>setStatement(e.target.value)}><option value="">Select statement…</option>{history.data?.statements.map(s=><option key={s.id} value={s.id}>{s.reference} · {s.ends_on} · {s.status}</option>)}</select></label>:null}
    {statement?<Button variant="outline" onClick={()=>{void report.refetch();void history.refetch();}}>Refresh reconciliation</Button>:null}
    {report.isError?<p role="alert" className="text-destructive">Reconciliation unavailable. Do not use previously loaded balances.</p>:report.isFetching?<p>Checking cash ledger…</p>:report.data?<CashDetail key={report.data.revision} report={report.data} canWrite={canWrite}/>:null}
    {!history.isError&&selectedReviews.length?<div className="space-y-3"><h2 className="text-lg font-semibold">Review history</h2>{selectedReviews.map(review=><div key={review.id} className="space-y-2 rounded border p-4">
      <p>{review.action} · {review.decision??'Pending'} · {review.requested_at}</p><p>{review.reason}</p><p className="text-sm">Requested by {review.requested_by}</p>
      {review.decision?<p>{review.decision_reason} · Reviewer {review.decided_by}</p>:canWrite&&review.requested_by!==user?.id?<FinanceActionForm title="Record reconciliation decision" fields={[
        {name:'decision',label:'Decision',options:[{value:'APPROVE',label:'Approve'},{value:'REJECT',label:'Reject'}]},{name:'reason',label:'Review evidence and reason'},
      ]} submit={v=>checked(supabase.rpc('decide_cash_review',{p_review_id:review.id,p_decision:v.decision,p_reason:v.reason}))}/>:<p>An independent reviewer must decide this request.</p>}
    </div>)}</div>:null}
  </section>;
}
function CashDetail({report:r,canWrite}:{report:CashReport;canWrite:boolean}) {
  const [bank,setBank]=useState<string[]>([]),[book,setBook]=useState<string[]>([]);
  const matched=new Set(r.matches.filter(x=>!x.removed_at).flatMap(x=>x.statement_line_ids));
  const toggle=(id:string,values:string[],set:(v:string[])=>void)=>set(values.includes(id)?values.filter(x=>x!==id):[...values,id]);
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">{r.reference} · {r.currency} · {r.status}</h2>
    {r.bankFeed?.changed?<p role="alert" className="text-destructive">The bank provider changed this statement's sources. Preserve the original evidence, then obtain reopening and void approval before rebuilding from the corrected feed.</p>:r.bankFeed?<p>Statement source agrees with the synchronized bank feed.</p>:null}
    {r.bankFeed&&!r.bankFeed.ready?<p role="alert">Complete a successful bank synchronization before submitting or approving reconciliation close.</p>:null}
    <dl className="grid gap-3 sm:grid-cols-3">{[['Bank closing',r.closing],['Cash GL closing',r.bookClosing],['Outstanding book items',r.outstanding],['Adjusted bank balance',r.adjustedBank],['Reconciliation variance',r.variance],['Opening variance',r.openingVariance]].map(([label,value])=><div key={label} className="rounded border p-3"><dt className="text-sm">{label}</dt><dd className="font-mono">{value}</dd></div>)}</dl>
    <p>Unmatched bank transactions: {r.unmatchedCount}</p>
    <div className="grid gap-4 lg:grid-cols-2"><div><h3 className="font-semibold">Bank transactions</h3><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Date / description</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>{r.lines.map(l=><TableRow key={l.id}>
      <TableCell>{matched.has(l.id)?'Matched':canWrite&&r.status==='OPEN'?<input aria-label={`Bank ${l.externalId}`} type="checkbox" checked={bank.includes(l.id)} onChange={()=>toggle(l.id,bank,setBank)}/>:null}</TableCell><TableCell>{l.date}<br/>{l.description}<br/>{l.reference}</TableCell><TableCell className="font-mono">{l.amount}</TableCell>
    </TableRow>)}</TableBody></Table></div><div><h3 className="font-semibold">Cash ledger entries</h3><Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Date / journal</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>{r.bookLines.map(l=><TableRow key={l.id}>
      <TableCell>{l.matched?'Matched':canWrite&&r.status==='OPEN'?<input aria-label={`Book ${l.number}`} type="checkbox" checked={book.includes(l.id)} onChange={()=>toggle(l.id,book,setBook)}/>:null}</TableCell><TableCell>{l.date}<br/>{l.number}<br/>{l.memo}</TableCell><TableCell className="font-mono">{l.amount}</TableCell>
    </TableRow>)}</TableBody></Table></div></div>
    {canWrite&&r.status==='OPEN'&&bank.length&&book.length?<FinanceActionForm key={bank.join()+book.join()} title="Match selected transactions" fields={[{name:'reason',label:'Matching evidence'}]} submit={v=>checked(supabase.rpc('match_cash_statement',{p_statement_id:r.id,p_bank_lines:bank,p_book_lines:book,p_reason:v.reason,p_revision:r.revision}))}/>:null}
    <details><summary>Matching audit history ({r.matches.length})</summary><div className="space-y-3">{r.matches.map(m=><div key={m.id} className="rounded border p-3"><p>{m.reason} · {m.removed_at?`Removed: ${m.removal_reason}`:'Active'}</p><p className="text-sm">Prepared by {m.created_by}</p>{canWrite&&r.status==='OPEN'&&!m.removed_at?<FinanceActionForm title="Remove match" fields={[{name:'reason',label:'Removal reason'}]} submit={v=>checked(supabase.rpc('remove_cash_match',{p_match_id:m.id,p_reason:v.reason}))}/>:null}</div>)}</div></details>
    {canWrite&&['OPEN','APPROVED'].includes(r.status)?<FinanceActionForm title="Submit reconciliation review" fields={[
      {name:'action',label:'Requested action',options:r.status==='APPROVED'?[{value:'REOPEN',label:'Reopen approved reconciliation'}]:[...(!r.bankFeed||!r.bankFeed.changed&&r.bankFeed.ready?[{value:'CLOSE',label:'Close reconciliation'}]:[]),{value:'VOID',label:'Void incorrect statement'}]},
      {name:'reason',label:'Reconciliation evidence and reason'},
    ]} submit={v=>checked(supabase.rpc('request_cash_review',{p_statement_id:r.id,p_action:v.action,p_reason:v.reason,p_revision:r.revision}))}/>:null}
    <Button variant="outline" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`reconciliation-${r.id}.json`;a.click();URL.revokeObjectURL(url);}}>Export reconciliation evidence</Button>
  </div>;
}
