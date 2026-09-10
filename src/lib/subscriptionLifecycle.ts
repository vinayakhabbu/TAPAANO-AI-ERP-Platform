import {z} from 'zod';
import {signedCents} from './financeReports';
const id=z.string().uuid(),amount=z.string().regex(/^\d+\.\d{2}$/),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pricing=z.object({unit_price:z.string().regex(/^\d+(\.\d{1,2})?$/),quantity:z.string().regex(/^[1-9]\d{0,5}$/),discount_percent:z.string().regex(/^\d+(\.\d{1,2})?$/)});
const term=z.object({reference:z.string(),starts_on:date,ends_on:date,price:amount,billing_anchor:date,billing_offset:z.number().int().nonnegative(),cycle_months:z.number().int(),pricing});
const action=z.object({slot:z.enum(['EARNED','UNUSED','REPLACEMENT','RENEWAL']),kind:z.enum(['CONTRACT_RECOGNIZE','CUSTOMER_CREDIT','CONTRACT_CREATE']),payload:z.record(z.unknown())});
const proposal=z.object({contractId:id,reference:z.string(),cycleId:id.nullable(),effectiveOn:date,action:z.enum(['CHANGE','CANCEL','RENEW']),earnedBeforeChange:amount,catchUpRecognition:amount,unusedCredit:amount,
 creditPreview:z.object({amount,arAmount:amount,balanceAmount:amount}).passthrough().nullable(),replacementTerms:term.nullable(),cancelledCycles:z.array(id),actions:z.array(action),
 history:z.array(z.object({cycle:z.object({id,price:amount}).passthrough()}).passthrough())}).passthrough();
const schema=z.object({contractId:id,entityId:id,currency:z.string().regex(/^[A-Z]{3}$/),terms:z.record(z.unknown()),changes:z.array(z.object({id,action:z.enum(['CHANGE','CANCEL','RENEW']),effectiveOn:date,contractId:id,replacementId:id.nullable(),creditId:id.nullable(),reversedOn:date.nullable(),requestId:id,proposal}))});
export type SubscriptionHistory=z.infer<typeof schema>;
function inputCents(value:string){const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}
export function parseSubscriptionHistory(value:unknown){const r=schema.parse(value);const seen=new Set<string>();
 const check=(ok:boolean)=>{if(!ok)throw new Error('Subscription change evidence does not reconcile.');};
 for(const c of r.changes){const p=c.proposal;check(!seen.has(c.id)&&(c.contractId===r.contractId||c.replacementId===r.contractId));seen.add(c.id);check(c.contractId===p.contractId&&c.action===p.action&&c.effectiveOn===p.effectiveOn&&(!c.reversedOn||c.reversedOn===c.effectiveOn));
  check(new Set(p.actions.map(a=>a.slot)).size===p.actions.length);check(signedCents(p.catchUpRecognition)<=signedCents(p.earnedBeforeChange));
  if(p.cycleId){const source=p.history.find(x=>x.cycle.id===p.cycleId);check(Boolean(source)&&signedCents(p.earnedBeforeChange)+signedCents(p.unusedCredit)===signedCents(source!.cycle.price));}
  if(p.creditPreview)check(signedCents(p.creditPreview.amount)===signedCents(p.unusedCredit)&&signedCents(p.creditPreview.amount)===signedCents(p.creditPreview.arAmount)+signedCents(p.creditPreview.balanceAmount));
  else check(p.unusedCredit==='0.00');
  check(Boolean(c.creditId)===(p.unusedCredit!=='0.00'));check(Boolean(c.replacementId)===Boolean(p.replacementTerms));
  if(p.replacementTerms){const t=p.replacementTerms,pr=t.pricing,discount=inputCents(pr.discount_percent);check(discount>=0n&&discount<10000n&&t.starts_on===c.effectiveOn&&t.ends_on>=t.starts_on);const net=(inputCents(pr.unit_price)*BigInt(pr.quantity)*(10000n-discount)+5000n)/10000n;check(net>0n&&net===signedCents(t.price));}
 }
 return r;
}
