import {useState} from 'react';
import {Button} from '@/components/ui/button';
export function TaxAssessmentFields({kind='AR',lineCount=1,optional=false,prefix='tax-'}:{kind?:'AR'|'AP';lineCount?:number;optional?:boolean;prefix?:string}){
 const [enabled,setEnabled]=useState(!optional),[parts,setParts]=useState([0]);
 return <section className="space-y-3"><h4 className="font-semibold">Tax assessment</h4>{optional?<label><input type="checkbox" name={prefix+'enabled'} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Include a sourced tax assessment</label>:<input type="hidden" name={prefix+'enabled'} value="on"/>}
  {enabled?<><p className="text-sm">Enter assessed amounts from your tax provider or reviewed source. Identify every document line, including exempt lines. These amounts are added to net prices.</p><div className="grid gap-3 sm:grid-cols-2">
   <label>Assessment source<select aria-label="Assessment source" name={prefix+'source'} className="block w-full rounded border bg-background p-2"><option value="REVIEWED">Reviewed tax assessment</option><option value="PROVIDER">Tax provider result</option></select></label>
   <label>Assessment reference<input aria-label="Assessment reference" name={prefix+'reference'} required maxLength={160} className="block w-full rounded border bg-background p-2"/></label>
   <label>Assessment date<input aria-label="Assessment date" name={prefix+'date'} type="date" required className="block w-full rounded border bg-background p-2"/></label>
   <label>Tax treatment evidence<input aria-label="Tax treatment evidence" name={prefix+'evidence'} required maxLength={2000} className="block w-full rounded border bg-background p-2"/></label>
  </div>{parts.map((n,index)=><fieldset key={n} className="grid gap-2 rounded border p-3 sm:grid-cols-3"><legend>Tax component {index+1}</legend>
   <label>Document line<select aria-label={`Tax component ${index+1} line`} name={prefix+'line-'+n} className="block w-full rounded border bg-background p-2">{Array.from({length:lineCount},(_,i)=><option key={i} value={i+1}>Line {i+1}</option>)}</select></label>
   <label>US jurisdiction<input aria-label={`Tax component ${index+1} jurisdiction`} name={prefix+'jurisdiction-'+n} placeholder="US-CA" required maxLength={80} className="block w-full rounded border bg-background p-2"/></label>
   <label>Treatment<select aria-label={`Tax component ${index+1} treatment`} name={prefix+'treatment-'+n} className="block w-full rounded border bg-background p-2">{kind==='AR'?<option value="SALES">Sales tax payable</option>:<><option value="EXPENSE">Nonrecoverable purchase tax</option><option value="RECOVERABLE">Recoverable purchase tax</option></>}<option value="EXEMPT">Exempt — zero basis and tax</option></select></label>
   <label>Taxable basis<input aria-label={`Tax component ${index+1} basis`} name={prefix+'basis-'+n} inputMode="decimal" required className="block w-full rounded border bg-background p-2"/></label>
   <label>Assessed tax<input aria-label={`Tax component ${index+1} amount`} name={prefix+'amount-'+n} inputMode="decimal" required className="block w-full rounded border bg-background p-2"/></label>
   {parts.length>1?<Button type="button" variant="outline" onClick={()=>setParts(parts.filter(p=>p!==n))}>Remove tax component {index+1}</Button>:null}
  </fieldset>)}<Button type="button" variant="outline" disabled={parts.length>=1000} onClick={()=>setParts([...parts,Math.max(...parts)+1])}>Add tax component</Button></>:null}
 </section>;
}
