import {z} from 'zod';
import {signedCents} from './financeReports';
const id=z.string().uuid(),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amount=z.string().regex(/^\d+\.\d{2}$/),signed=z.string().regex(/^-?\d+\.\d{2}$/),timestamp=z.string().regex(/^\d{1,12}$/);
const balance=z.object({id:z.string().regex(/^txn_[A-Za-z0-9]+$/),source:z.string().regex(/^re_[A-Za-z0-9]+$/),amount:signed,currency:z.literal('USD'),type:z.enum(['refund','refund_failure','payment_refund','payment_failure_refund']),created:timestamp});
const proof=z.object({id:z.string().regex(/^re_[A-Za-z0-9]+$/),chargeId:z.string().regex(/^ch_[A-Za-z0-9]+$/),paymentIntentId:z.string().regex(/^pi_[A-Za-z0-9]+$/),amount,currency:z.literal('USD'),status:z.enum(['pending','requires_action','succeeded','failed','canceled']),created:timestamp,jobId:id,approvalDigest:z.string().regex(/^[a-f0-9]{32}$/),balance:balance.nullable(),failureBalance:balance.nullable()});
const schema=z.object({entityId:id,currency:z.literal('USD'),total:z.number().int().nonnegative(),nextCursor:id.nullable(),refunds:z.array(z.object({id,entityId:id,connectionId:id,creditId:id,receiptId:id,invoiceId:id,reference:z.string(),amount,date,environment:z.enum(['TEST','LIVE']),accountId:z.string(),requestId:id,canceled:z.boolean(),dispatchStartedAt:z.string().nullable(),providerId:z.string().nullable(),proof:proof.nullable(),lastCheckedAt:z.string().nullable(),lastError:z.string().nullable(),nextAttemptAt:z.string(),postingDate:date.nullable(),returnDate:date.nullable(),useId:id.nullable(),journalId:id.nullable(),reversedOn:date.nullable(),reversalJournalId:id.nullable(),observationCount:z.number().int().nonnegative()}))});
export type ProviderRefund=z.infer<typeof schema>['refunds'][number];
export function parseProviderRefundReport(value:unknown){
 const r=schema.parse(value),seen=new Set<string>();
 const check=(ok:unknown)=>{if(!ok)throw new Error('Provider refund evidence is inconsistent.');};
 check(r.refunds.length<=r.total);
 for(const j of r.refunds){check(j.entityId===r.entityId&&!seen.has(j.id)&&signedCents(j.amount)>0n);seen.add(j.id);check((j.useId===null)===(j.journalId===null));check((j.reversedOn===null)===(j.reversalJournalId===null));check(!j.canceled||!j.dispatchStartedAt&&!j.providerId&&!j.useId);check((j.proof===null)===(j.providerId===null));
  if(j.proof){const p=j.proof;check(j.dispatchStartedAt&&j.lastCheckedAt&&j.observationCount>0&&p.id===j.providerId&&p.jobId===j.id&&p.amount===j.amount);if(p.balance)check(p.balance.source===p.id&&signedCents(p.balance.amount)===-signedCents(j.amount));if(p.failureBalance)check(p.failureBalance.source===p.id&&signedCents(p.failureBalance.amount)===signedCents(j.amount));if(p.status==='succeeded')check(p.balance&&!p.failureBalance);if(['failed','canceled'].includes(p.status)&&p.balance)check(p.failureBalance);}
 }
 return r;
}
export function providerRefundStatus(j:ProviderRefund){
 if(j.canceled)return 'Canceled before dispatch';
 if(j.lastError==='RECOVERY_REQUIRED')return 'Recovery requires provider review';
 if(!j.proof)return j.dispatchStartedAt?'Dispatch outcome uncertain':'Approved and queued';
 if(j.proof.status==='succeeded')return j.useId?'Posted to processor clearing':'Verified; awaiting accounting review';
 if(['failed','canceled'].includes(j.proof.status))return j.useId&&!j.reversedOn?'Funds returned; correction review required':'Provider refund returned or canceled';
 return j.proof.status==='requires_action'?'Provider needs customer action':'Provider refund pending';
}

export const providerRefundEvidenceSchema=z.object({jobId:id,dispatchApprovalId:id,preflight:z.object({invoiceId:z.string(),paymentId:z.string(),paymentIntentId:z.string(),chargeId:z.string(),receiptAmount:amount,currency:z.literal('USD'),accountId:z.string(),environment:z.enum(['TEST','LIVE'])}).nullable(),observations:z.array(z.object({id,observedAt:z.string(),proof,bodySha256:z.string().regex(/^[a-f0-9]{64}$/)})),total:z.number().int().nonnegative(),nextCursor:id.nullable()});
