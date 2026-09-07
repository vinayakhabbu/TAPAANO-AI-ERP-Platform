import {z} from 'zod';
export const integrationReportSchema=z.object({entityId:z.string().uuid(),asOf:z.string(),currency:z.string(),revision:z.string(),totalEvents:z.number().int().nonnegative(),nextCursor:z.string().uuid().nullable(),
 controls:z.array(z.object({connectionId:z.string().uuid(),accountId:z.string().uuid(),balance:z.string().regex(/^-?\d+\.\d{2}$/)})),
 events:z.array(z.object({id:z.string().uuid(),connectionId:z.string().uuid(),connection:z.string(),operation:z.enum(['RECEIPT','PAYOUT','USAGE','JOURNAL','UNSUPPORTED']),object:z.string(),state:z.enum(['RECEIVED','APPLIED','IGNORED','REVERSED']),source:z.record(z.unknown()),receivedAt:z.string(),result:z.unknown().nullable(),reversal:z.unknown().nullable(),deliveries:z.number().int().positive()})),
});
export type IntegrationReport=z.infer<typeof integrationReportSchema>;
