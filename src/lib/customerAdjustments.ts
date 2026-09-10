import {z} from 'zod';
import {signedCents,decimal} from './financeReports';
const id=z.string().uuid(),amount=z.string().regex(/^\d+\.\d{2}$/),signed=z.string().regex(/^-?\d+\.\d{2}$/),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema=z.object({entityId:id,asOf:date,currency:z.string().regex(/^[A-Z]{3}$/),revision:z.string(),
 control:z.object({configured:z.boolean(),accountId:id.nullable(),expected:amount,ledger:signed,variance:signed,reconciled:z.boolean()}),
 invoices:z.array(z.object({id,number:z.string(),customerId:id,customerName:z.string(),date,original:amount,remaining:amount,legacyCredited:z.boolean(),contractId:id.nullable(),
  lines:z.array(z.object({id,description:z.string(),original:amount,available:amount})),
  receipts:z.array(z.object({id,kind:z.enum(['RECEIPT','REPLACEMENT']),date,amount,available:amount}))})),
 credits:z.array(z.object({subscriptionChangeId:id.nullable().default(null),subscriptionContractId:id.nullable().default(null),id,invoiceId:id,customerId:id,reference:z.string(),date,amount,arAmount:amount,balanceAmount:amount,remaining:amount,providerReserved:amount.default('0.00'),availableToUse:amount.optional(),reversedOn:date.nullable(),journalId:id,
  lines:z.array(z.object({lineId:id,description:z.string(),amount,revenueAccountId:id})),obligations:z.array(z.object({key:z.string(),amount,recognized:amount})),
  uses:z.array(z.object({id,providerRefundId:id.nullable().default(null),kind:z.enum(['REFUND','APPLY']),date,amount,reference:z.string(),invoiceId:id.nullable(),cashAccountId:id.nullable(),settlementId:id.nullable(),settlementKind:z.enum(['RECEIPT','REPLACEMENT']).nullable(),journalId:id,reversedOn:date.nullable()}))}))});
export type CustomerAdjustments=z.infer<typeof schema>;
export function parseCustomerAdjustments(value:unknown){
 const r=schema.parse(value),invoices=new Map(r.invoices.map(i=>[i.id,i])),seen=new Set<string>();let balance=0n;
 const check=(ok:boolean)=>{if(!ok)throw new Error('Customer adjustment figures do not reconcile.');};
 for(const i of r.invoices){check(!seen.has(i.id)&&i.date<=r.asOf);seen.add(i.id);check(signedCents(i.remaining)<=signedCents(i.original));check(i.lines.reduce((s,l)=>s+signedCents(l.original),0n)===signedCents(i.original));check(new Set(i.lines.map(l=>l.id)).size===i.lines.length);for(const l of i.lines)check(signedCents(l.available)<=signedCents(l.original));for(const p of i.receipts)check(signedCents(p.available)<=signedCents(p.amount));}
 for(const c of r.credits){const i=invoices.get(c.invoiceId);check(!seen.has(c.id)&&Boolean(i)&&i?.customerId===c.customerId&&c.date<=r.asOf&&(!c.reversedOn||(c.reversedOn>=c.date&&c.reversedOn<=r.asOf)));seen.add(c.id);
  check(signedCents(c.amount)===signedCents(c.arAmount)+signedCents(c.balanceAmount)&&signedCents(c.amount)>0n);
  check(c.lines.reduce((s,l)=>s+signedCents(l.amount),0n)===signedCents(c.amount)&&new Set(c.lines.map(l=>l.lineId)).size===c.lines.length);for(const l of c.lines)check(Boolean(i?.lines.some(x=>x.id===l.lineId))&&signedCents(l.amount)>0n);
  if(c.obligations.length){check(c.obligations.reduce((s,o)=>s+signedCents(o.amount),0n)===signedCents(c.amount));for(const o of c.obligations)check(signedCents(o.recognized)<=signedCents(o.amount));}
  let remaining=c.reversedOn?0n:signedCents(c.balanceAmount);
  for(const u of c.uses){check(!seen.has(u.id)&&u.date>=c.date&&u.date<=r.asOf&&signedCents(u.amount)>0n&&(!u.reversedOn||(u.reversedOn>=u.date&&u.reversedOn<=r.asOf)));seen.add(u.id);
   if(u.kind==='APPLY')check(Boolean(u.invoiceId)&&invoices.get(u.invoiceId!)?.customerId===c.customerId&&!u.cashAccountId&&!u.settlementId&&!u.settlementKind);
   else check(Boolean(u.cashAccountId&&u.settlementId&&u.settlementKind)&&!u.invoiceId);
   if(!u.reversedOn)remaining-=signedCents(u.amount);
  }
  check(remaining>=0n&&remaining===signedCents(c.remaining));
  const available=remaining-signedCents(c.providerReserved);if(c.availableToUse===undefined)c.availableToUse=decimal(available>0n?available:0n);check(signedCents(c.availableToUse)===(available>0n?available:0n));balance+=remaining;
 }
 check(balance===signedCents(r.control.expected));check(signedCents(r.control.ledger)-balance===signedCents(r.control.variance));check(r.control.reconciled===(r.control.variance==='0.00'));return r;
}
export function customerAdjustmentCsv(r:CustomerAdjustments){
 const quote=(v:string)=>'"'+(/^[=+\-@\t\r]/.test(v)?"'":'')+v.replace(/"/g,'""')+'"';
 const rows=[['Type','Reference','Date','Invoice','Amount','AR reduction','Customer balance','Remaining','Reversed on','Journal','Currency']];
 for(const c of r.credits){rows.push(['CREDIT',c.reference,c.date,c.invoiceId,c.amount,c.arAmount,c.balanceAmount,c.remaining,c.reversedOn??'',c.journalId,r.currency]);for(const u of c.uses)rows.push([u.kind,u.reference,u.date,u.invoiceId??c.invoiceId,u.amount,'','',decimal(0n),u.reversedOn??'',u.journalId,r.currency]);}
 return rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
}
