import { z } from 'zod';
import { bankFeedSourceSchema } from './bankFeed';

const amount=z.string().regex(/^-?\d+\.\d{2}$/);
export const cashReportSchema=z.object({
  id:z.string().uuid(),registerId:z.string().uuid(),entityId:z.string().uuid(),accountId:z.string().uuid(),currency:z.string().length(3),
  reference:z.string(),startsOn:z.string(),endsOn:z.string(),status:z.enum(['OPEN','SUBMITTED','APPROVED','VOID']),revision:z.string(),
  bankFeed:bankFeedSourceSchema.nullable().default(null),
  opening:amount,closing:amount,bookClosing:amount,outstanding:amount,adjustedBank:amount,variance:amount,openingVariance:amount,unmatchedCount:z.number().int().nonnegative(),
  lines:z.array(z.object({id:z.string().uuid(),externalId:z.string(),date:z.string(),description:z.string(),reference:z.string(),amount})),
  bookLines:z.array(z.object({id:z.string().uuid(),journalId:z.string().uuid(),number:z.string(),date:z.string(),memo:z.string().nullable(),amount,matched:z.boolean()})),
  matches:z.array(z.object({id:z.string().uuid(),statement_line_ids:z.array(z.string()),journal_line_ids:z.array(z.string()),reason:z.string(),created_by:z.string(),removed_at:z.string().nullable(),removal_reason:z.string().nullable()})),
});
export type CashReport=z.infer<typeof cashReportSchema>;

export { parseBankCsv } from "./bankCsv";
