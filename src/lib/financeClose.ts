import {z} from 'zod';
const id=z.string().uuid(),amount=z.string().regex(/^-?\d+\.\d{2}$/);
export const journalLinesFromValues=(v:Record<string,string>)=>Object.keys(v).filter(k=>k.startsWith('account-')).map(k=>{const n=k.slice(8);return {account_id:v[k],debit:v['debit-'+n],credit:v['credit-'+n]};});
const control=z.object({accountId:id,expected:amount,ledger:amount,variance:amount});
export const scheduleSchema=z.object({id,entityId:id,reference:z.string(),kind:z.enum(['PREPAID','FIXED_ASSET','RECURRING','ACCRUAL']),currency:z.string(),state:z.enum(['ACTIVE','CANCELLED','DISPOSED']),asOf:z.string(),terms:z.record(z.unknown()),cost:amount.nullable(),expensed:amount.nullable(),carryingValue:amount.nullable(),disposedAsOf:z.boolean(),
 entries:z.array(z.object({id,kind:z.string(),date:z.string(),amount,journalId:id,reversedOn:z.string().nullable(),reversalId:id.nullable(),details:z.record(z.unknown())})),projection:z.array(z.union([z.string(),z.object({date:z.string(),cumulativeExpense:amount})])),controls:z.array(control),
});
export type FinanceSchedule=z.infer<typeof scheduleSchema>;
export const acquisitionSchema=z.object({hasMore:z.boolean(),rows:z.array(z.object({id,accountId:id,code:z.string(),name:z.string(),journal:z.string(),date:z.string(),cost:amount}))});
export const closeCheckSchema=z.object({entityId:id,from:z.string(),through:z.string(),canClose:z.boolean(),revision:z.string(),generatedAt:z.string().datetime({offset:true}),trialBalance:z.record(z.unknown()),ar:z.unknown().nullable(),ap:z.unknown().nullable(),assetControls:z.array(control),revenueControls:z.array(control),intercompanyControls:z.array(control).default([]),
 statementControls:z.record(z.unknown()).optional(),
 banks:z.array(z.object({registerId:id,name:z.string(),approvedThrough:z.string().nullable(),statementId:id.nullable(),complete:z.boolean()})),periods:z.array(z.object({id,startsOn:z.string(),endsOn:z.string(),status:z.string(),version:z.number().int()})),
 unregisteredCashAccounts:z.number().int(),pendingSchedules:z.number().int(),unfinalizedUsage:z.number().int(),unrecognizedRevenue:amount,unresolvedProviderEvents:z.number().int(),pendingFinanceRequests:z.number().int(),
});
export const closeAttestations=[['bank_sources_complete','Bank statements and provider clearing reviewed'],['usage_and_contracts_complete','Usage totals and contract obligations reviewed'],['unrecorded_liabilities_reviewed','Unrecorded liabilities and cutoff reviewed'],['asset_policies_reviewed','Asset lives, residual values and schedules reviewed'],['tax_and_opening_balances_reviewed','Tax provisions and opening balances reviewed']] as const;
