import {z} from 'zod';
import {signedCents} from './financeReports';
const id=z.string().uuid(),amount=z.string().regex(/^-?\d+\.\d{2}$/),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema=z.object({entityId:id,currency:z.string(),from:date,through:date,revision:z.string(),reconciled:z.boolean(),
 policy:z.object({id,sales_account:id,recoverable_account:id,expense_account:id}).nullable(),
 foreignDocuments:z.array(z.object({id,kind:z.enum(['RECEIVABLE','PAYABLE']),number:z.string(),date,currency:z.string(),foreignNet:amount,foreignTax:amount,foreignTotal:amount,functionalTotal:amount,rate:z.string(),taxParts:z.unknown(),assessment:z.unknown(),journalId:id,requestId:id})).default([]),
 documents:z.array(z.object({id,kind:z.enum(['AR','AP']),documentId:id,number:z.string(),date,subtotal:amount,tax:amount,total:amount,assessment:z.unknown(),requestId:id,journalId:id,canCredit:z.boolean()})),
 movements:z.array(z.object({sourceId:id,kind:z.string(),date,accountId:id,jurisdiction:z.string(),amount,journalId:id})),
 controls:z.array(z.object({accountId:id,code:z.string(),name:z.string(),expected:amount,ledger:amount,variance:amount})),
 settlements:z.array(z.object({id,kind:z.enum(['SALES_PAYMENT','RECOVERABLE_REFUND']),date,amount,reference:z.string(),journalId:id,reversedOn:date.nullable()})),
});
export type TaxRegister=z.infer<typeof schema>;
export function parseTaxRegister(value:unknown){const r=schema.parse(value);if(r.documents.some(d=>signedCents(d.subtotal)+signedCents(d.tax)!==signedCents(d.total)||d.date<r.from||d.date>r.through)||r.controls.some(c=>signedCents(c.ledger)-signedCents(c.expected)!==signedCents(c.variance))||r.reconciled!==r.controls.every(c=>c.variance==='0.00'))throw new Error('Tax register amounts do not reconcile.');return r;}
export function readTaxAssessment(v:Record<string,string>,prefix='tax-'){
 if(v[prefix+'enabled']!=='on')return undefined;
 return {source:v[prefix+'source'],reference:v[prefix+'reference'],assessed_on:v[prefix+'date'],evidence:v[prefix+'evidence'],lines:Object.keys(v).filter(k=>k.startsWith(prefix+'jurisdiction-')).map(k=>{const n=k.slice((prefix+'jurisdiction-').length);return {line_number:Number(v[prefix+'line-'+n]),jurisdiction:v[k],treatment:v[prefix+'treatment-'+n],basis:v[prefix+'basis-'+n],amount:v[prefix+'amount-'+n]};})};
}
