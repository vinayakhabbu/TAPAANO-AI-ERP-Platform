import {useQuery} from '@tanstack/react-query';
import {FinanceActionForm} from './FinanceActionForm';
import {useAuth} from '@/hooks/useAuth';
import {financeResult,requestFinance} from '@/hooks/useFinanceApprovals';
import {supabase} from '@/integrations/supabase/client';
import {parseSubscriptionHistory} from '@/lib/subscriptionLifecycle';
import {downloadFinanceEvidence} from '@/lib/groupFinance';
import {Button} from '@/components/ui/button';

export function SubscriptionLifecycle({contractId,entityId,canWrite}:{contractId:string;entityId:string;canWrite:boolean}){
 const {user,profile}=useAuth();
 const history=useQuery({queryKey:['subscription-history',user?.id,profile?.org_id,contractId],retry:false,queryFn:async()=>{const r=parseSubscriptionHistory(await financeResult(supabase.rpc('get_subscription_history',{p_contract:contractId})));if(r.contractId!==contractId||r.entityId!==entityId)throw new Error('Subscription history scope mismatch.');return r;}});
 if(history.isError)return <section role="alert"><p>Subscription history unavailable. Do not use previously loaded change evidence.</p><Button variant="outline" onClick={()=>void history.refetch()}>Retry subscription history</Button></section>;
 if(!history.data)return <p>Loading subscription changes…</p>;
 const r=history.data,changed=r.changes.some(c=>c.contractId===contractId&&!c.reversedOn);
 const recurring=r.terms.kind==='FIXED'&&[1,3,12].includes(Number(r.terms.cycle_months))&&Array.isArray(r.terms.obligations)&&r.terms.obligations.length===1&&r.terms.obligations[0]?.method==='DAILY';
 return <section className="space-y-4"><h3 className="font-semibold">Subscription changes and renewals</h3><Button variant="outline" disabled={history.isFetching} onClick={()=>void history.refetch()}>Refresh subscription history</Button>
  <p>Changes use actual service days and preserve the original billing anchor. Approval recognizes delivered service, credits unused service, and creates the replacement term together. Invoice the replacement from its contract page, then apply the customer balance or record a confirmed refund.</p>
  {canWrite&&recurring&&!changed?<div className="grid gap-4 lg:grid-cols-2"><details><summary>Upgrade, downgrade or change seats</summary><FinanceActionForm title="Request subscription change" fields={[
   {name:'effective',label:'New service starts',type:'date'},{name:'reference',label:'Replacement subscription reference'},{name:'credit',label:'Unused service credit reference'},{name:'price',label:'Unit price per full billing cycle'},{name:'quantity',label:'New seat or unit quantity',value:'1'},{name:'discount',label:'Discount percent',value:'0.00'},{name:'reason',label:'Signed change and allocation evidence'},
  ]} submit={(v,key)=>requestFinance(entityId,'SUBSCRIPTION_CHANGE',{contract_id:contractId,action:'CHANGE',effective_on:v.effective,reference:v.reference,credit_reference:v.credit,unit_price:v.price,quantity:v.quantity,discount_percent:v.discount},v.reason,key)}/></details>
  <details><summary>Cancel remaining subscription service</summary><FinanceActionForm title="Request subscription cancellation" fields={[{name:'effective',label:'Cancellation effective service date',type:'date'},{name:'credit',label:'Cancellation credit reference'},{name:'reason',label:'Signed cancellation evidence'}]} submit={(v,key)=>requestFinance(entityId,'SUBSCRIPTION_CHANGE',{contract_id:contractId,action:'CANCEL',effective_on:v.effective,credit_reference:v.credit},v.reason,key)}/></details>
  <details><summary>Approve a renewal term</summary><FinanceActionForm title="Request subscription renewal" fields={[{name:'reference',label:'Renewal subscription reference'},{name:'end',label:'Renewal service ends',type:'date'},{name:'price',label:'Renewal unit price per billing cycle'},{name:'quantity',label:'Renewal seat or unit quantity',value:'1'},{name:'discount',label:'Renewal discount percent',value:'0.00'},{name:'reason',label:'Signed renewal evidence'}]} submit={(v,key)=>requestFinance(entityId,'SUBSCRIPTION_RENEW',{contract_id:contractId,reference:v.reference,ends_on:v.end,unit_price:v.price,quantity:v.quantity,discount_percent:v.discount},v.reason,key)}/><p>The new term begins the day after the current term ends. Approval creates its finite billing schedule; external subscription changes and charges require a connected provider workflow.</p></details>
  </div>:null}
  {r.changes.map(c=><article key={c.id} className="rounded border p-4 space-y-2"><h4 className="font-semibold">{c.action} · {c.effectiveOn}{c.reversedOn?' · Corrected':''}</h4><p>Delivered service {c.proposal.earnedBeforeChange} · Recognition catch-up {c.proposal.catchUpRecognition} · Unused-service credit {c.proposal.unusedCredit} {r.currency}</p>
   {c.proposal.replacementTerms?<p>Replacement price per full cycle {c.proposal.replacementTerms.price} · Quantity {c.proposal.replacementTerms.pricing.quantity} · Discount {c.proposal.replacementTerms.pricing.discount_percent}% · Service {c.proposal.replacementTerms.starts_on} through {c.proposal.replacementTerms.ends_on}</p>:null}
   {c.replacementId?<a className="underline" href={`/contracts?contract=${c.replacementId}`}>View replacement subscription</a>:null}
   {canWrite&&!c.reversedOn&&c.contractId===contractId?<details><summary>Correct an unused change on its original date</summary><FinanceActionForm title="Request subscription correction" fields={[{name:'date',label:'Original subscription effective date',type:'date',value:c.effectiveOn},{name:'reason',label:'Subscription correction evidence'}]} submit={(v,key)=>requestFinance(entityId,'SUBSCRIPTION_REVERSE',{change_id:c.id,date:v.date},v.reason,key)}/><p>Corrections require the original open date, no activity on the replacement term, and reversal of any use of the unused-service credit. Later changes use a new prospective amendment.</p></details>:null}
  </article>)}
  <Button variant="outline" onClick={()=>downloadFinanceEvidence(`subscription-${contractId}.json`,JSON.stringify(r,null,2))}>Export subscription change evidence</Button>
 </section>;
}
