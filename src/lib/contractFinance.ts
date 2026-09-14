import {z} from 'zod';
const amount=z.string().regex(/^-?\d+\.\d{2}$/),id=z.string().uuid();
const revisionObligation=z.object({key:z.string(),amount,treatment:z.enum(['PROSPECTIVE','CATCH_UP']),method:z.enum(['DAILY','MILESTONE','PERCENT_COMPLETE']),starts_on:z.string(),ends_on:z.string(),progress:z.string(),evidence:z.string(),baseline:amount,creditsAtRevision:amount});
const allocation=z.object({key:z.string(),description:z.string(),standalone_price:z.string(),method:z.enum(['DAILY','MILESTONE','USAGE']),amount});
export const contractFinanceSchema=z.object({
 id,entityId:id,customerId:id,reference:z.string(),currency:z.string(),asOf:z.string(),billed:amount,recognized:amount,deferred:amount,unbilled:amount,
 controls:z.array(z.object({accountId:id,code:z.string(),name:z.string(),label:z.string(),expected:amount,ledger:amount,variance:amount})),
 terms:z.object({kind:z.enum(['FIXED','USAGE']),timezone:z.string()}),
 cycles:z.array(z.object({id,number:z.number().int(),startsOn:z.string(),endsOn:z.string(),price:amount,originalPrice:amount.optional(),revisions:z.array(z.object({id,version:z.number().int().positive(),date:z.string(),price:amount,amount,plan:z.array(revisionObligation),journalId:id.nullable(),requestId:id})).default([]),supplements:z.array(z.object({id,date:z.string(),amount,invoiceId:id,requestId:id})).default([]),allocations:z.array(allocation),
  usageFinalized:z.boolean(),usage:z.object({units:z.string(),count:z.number().int(),revision:z.string()}),invoiceId:id.nullable(),invoiceDate:z.string().nullable(),billingRequest:id.nullable(),creditId:id.nullable(),cancelled:z.boolean(),
  billed:amount,recognized:amount,deferred:amount,unbilled:amount,
  schedule:z.array(z.object({through:z.string(),cumulativeEarned:z.array(z.object({key:z.string(),amount})).nullable()})),
  recognitions:z.array(z.object({id,date:z.string(),amount,journalId:id.nullable(),kind:z.enum(['RECOGNITION','REVISION']).optional(),evidence:z.array(z.object({key:z.string(),satisfied_on:z.string(),reference:z.string()}))})),
 })),
});
export type ContractFinance=z.infer<typeof contractFinanceSchema>;
