import {z} from 'zod';
import {signedCents} from './financeReports';
const id=z.string().uuid(),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amount=z.string().regex(/^-?\d+\.\d{2}$/);
const identity={externalId:z.string().min(1).max(150),accountId:z.string().min(1).max(150)};
const posted={...identity,currency:z.literal('USD'),date,description:z.string().max(500),amount,pendingId:z.string().nullable()};
const source=z.discriminatedUnion('state',[z.object({...posted,state:z.literal('POSTED')}),z.object({...posted,state:z.literal('PENDING')}),z.object({...identity,state:z.literal('REMOVED')})]);
export const bankFeedSourceSchema=z.object({feedId:id,label:z.string(),importGeneration:z.number().int().positive(),changed:z.boolean(),ready:z.boolean(),currentRevision:z.string().regex(/^[a-f0-9]{32}$/),evidence:z.string()});
const schema=z.object({feed:z.object({id,org_id:id,entity_id:id,register_id:id,label:z.string(),provider:z.literal('PLAID'),environment:z.enum(['SANDBOX','PRODUCTION']),item_id:z.string(),account_id:z.string(),coverage_start:date,enabled:z.boolean(),version:z.number().int().positive(),request_id:id}),
 from:date,through:date,generation:z.number().int().nonnegative(),updateStatus:z.enum(['NOT_READY','INITIAL_UPDATE_COMPLETE','HISTORICAL_UPDATE_COMPLETE','TRANSACTIONS_UPDATE_STATUS_UNKNOWN']),lastSuccessAt:z.string().datetime({offset:true}).nullable(),lastError:z.string().nullable(),nextAttemptAt:z.string().datetime({offset:true}),syncInProgress:z.boolean(),
 transactions:z.array(z.object({id,revision:z.number().int().positive(),source})),totalTransactions:z.number().int().nonnegative(),nextCursor:z.string().nullable(),postedCount:z.number().int().nonnegative(),postedNet:amount,windowRevision:z.string().regex(/^[a-f0-9]{32}$/),
 statements:z.array(z.object({statementId:id,reference:z.string(),status:z.enum(['OPEN','SUBMITTED','APPROVED']),source:bankFeedSourceSchema})),
});
export function parseBankFeedReport(value:unknown){const r=schema.parse(value);
 if(new Set(r.transactions.map(t=>t.id)).size!==r.transactions.length||r.postedCount>r.totalTransactions||r.transactions.some(t=>t.source.accountId!==r.feed.account_id)||r.statements.some(s=>s.source.feedId!==r.feed.id)||r.nextCursor&&r.nextCursor!==r.transactions.at(-1)?.source.externalId)throw new Error('Bank feed evidence does not reconcile.');
 if(r.transactions.length===r.totalTransactions){const posted=r.transactions.filter(t=>t.source.state==='POSTED'&&signedCents(t.source.amount)!==0n);if(posted.length!==r.postedCount||posted.reduce((n,t)=>n+(t.source.state==='POSTED'?signedCents(t.source.amount):0n),0n)!==signedCents(r.postedNet))throw new Error('Bank feed totals do not reconcile.');}
 return r;
}
