import {z} from 'zod';
import {statementCashTotal,mappedStatementsSchema,groupCashFlowSchema,parseMappedStatements,parseGroupCashFlow} from './financialStatements';
import {signedCents,decimal} from './financeReports';
import {csvCell} from './trialBalance';
const id=z.string().uuid(),amount=z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const control=z.object({accountId:id,expected:amount,ledger:amount,variance:amount});
export const intercompanySchema=z.object({entityId:id,asOf:date,currency:z.string(),revision:z.string(),controls:z.array(control),transfers:z.array(z.object({id,sellerId:id,buyerId:id,reference:z.string(),kind:z.enum(['SERVICE','FUNDING']),date,amount,outstanding:amount,reversedOn:date.nullable(),terms:z.record(z.unknown()),settlements:z.array(z.object({id,date,amount,reversedOn:date.nullable(),sellerJournal:id,buyerJournal:id}))}))});
export const quoteSchema=z.object({currency:z.string().regex(/^[A-Z]{3}$/),kind:z.enum(['CLOSING','AVERAGE','HISTORICAL']),date});
export const rateRequirementsSchema=z.object({groupId:id,currency:z.string(),from:date,through:date,quotes:z.array(quoteSchema)});
export type FxQuote=z.infer<typeof quoteSchema>&{rate:string};
const groupRow=z.object({accountId:id,code:z.string(),name:z.string(),accountType:z.enum(['asset','liability','equity','revenue','expense']),sourceClosing:amount,automaticClosing:amount,adjustmentClosing:amount,translationClosing:amount,closing:amount,sourceIncome:amount,automaticIncome:amount,adjustmentIncome:amount,income:amount});
export const consolidationSchema=z.object({groupId:id,groupName:z.string(),currency:z.string().regex(/^[A-Z]{3}$/),from:date,through:date,revision:z.string(),generatedAt:z.string().optional(),rows:z.array(groupRow),netIncome:amount,translationAdjustment:amount,canFinalize:z.boolean(),pendingGroupAdjustments:z.number().int(),unresolvedAdjustmentSources:z.number().int().default(0),journalCount:z.number().int(),rates:z.array(quoteSchema.extend({rate:z.string()})),externalIntercompany:z.array(z.record(z.unknown())),
 presentationConfigured:z.boolean().default(false),presentationComplete:z.boolean().default(false),missingStatementEntities:z.array(id).default([]),cashBalanceAgrees:z.boolean().default(false),statements:mappedStatementsSchema.nullable().default(null),cashFlow:groupCashFlowSchema.nullable().default(null),
 members:z.array(z.object({entityId:id,name:z.string(),currency:z.string(),ledgerRevision:z.string(),journalCount:z.number().int(),periodsClosed:z.boolean(),closeChecks:z.record(z.unknown()),translationAdjustment:amount,rows:z.array(z.object({accountId:id,closing:amount,income:amount}))})),
});
export type Consolidation=z.infer<typeof consolidationSchema>;
export function parseConsolidation(value:unknown,scope:{group:string;from:string;through:string}):Consolidation{
 const r=consolidationSchema.parse(value);if(r.groupId!==scope.group||r.from!==scope.from||r.through!==scope.through)throw new Error('Consolidation scope mismatch.');
 const ids=new Set<string>(),members=new Set<string>(),source=new Map<string,{closing:bigint;income:bigint}>();let total=0n,income=0n,translation=0n,rowTranslation=0n,automatic=0n,adjustment=0n;
 for(const member of r.members){if(members.has(member.entityId))throw new Error('Duplicate consolidation member.');members.add(member.entityId);const seen=new Set<string>();let balance=0n;
  for(const row of member.rows){if(seen.has(row.accountId))throw new Error('Duplicate member account.');seen.add(row.accountId);const a=source.get(row.accountId)??{closing:0n,income:0n};a.closing+=signedCents(row.closing);a.income+=signedCents(row.income);source.set(row.accountId,a);balance+=signedCents(row.closing);}
  const cta=signedCents(member.translationAdjustment);if(balance+cta!==0n)throw new Error('Member translation does not balance.');translation+=cta;
 }
 for(const row of r.rows){if(ids.has(row.accountId))throw new Error('Duplicate consolidated account.');ids.add(row.accountId);const c=signedCents(row.closing),i=signedCents(row.income),s=source.get(row.accountId)??{closing:0n,income:0n};
  if(signedCents(row.sourceClosing)!==s.closing||signedCents(row.sourceIncome)!==s.income||c!==s.closing+signedCents(row.automaticClosing)+signedCents(row.adjustmentClosing)+signedCents(row.translationClosing)||i!==s.income+signedCents(row.automaticIncome)+signedCents(row.adjustmentIncome))throw new Error('Consolidated account does not reconcile to its sources.');
  if(!['revenue','expense'].includes(row.accountType)&&i!==0n)throw new Error('Balance-sheet account cannot supply period income.');total+=c;income-=i;rowTranslation+=signedCents(row.translationClosing);automatic+=signedCents(row.automaticClosing);adjustment+=signedCents(row.adjustmentClosing);source.delete(row.accountId);
 }
 if(source.size||total!==0n||automatic!==0n||adjustment!==0n||rowTranslation!==translation||income!==signedCents(r.netIncome)||translation!==signedCents(r.translationAdjustment))throw new Error('Consolidation totals do not reconcile.');
 if(r.canFinalize&&(r.pendingGroupAdjustments!==0||r.unresolvedAdjustmentSources!==0||r.members.some(m=>!m.periodsClosed||m.closeChecks.canClose!==true)))throw new Error('Consolidation readiness does not match its source checks.');
 if(r.statements){parseMappedStatements(r.statements);if(r.statements.netIncome!==r.netIncome)throw new Error('Mapped group income differs from the consolidated ledger.');}
 if(r.cashFlow){parseGroupCashFlow(r.cashFlow);if(r.cashFlow.groupId!==r.groupId||r.cashFlow.from!==r.from||r.cashFlow.through!==r.through||r.cashFlow.currency!==r.currency||r.cashFlow.members.length!==members.size||r.cashFlow.members.some(m=>!members.has(m.entityId)))throw new Error('Group cash-flow scope changed.');}
 const agrees=Boolean(r.statements&&r.cashFlow&&statementCashTotal(r.statements)===r.cashFlow.closingCash),complete=Boolean(r.statements?.complete&&r.cashFlow?.complete&&r.missingStatementEntities.length===0&&agrees);
 if(r.cashBalanceAgrees!==agrees||r.presentationComplete!==complete||(r.presentationConfigured&&r.canFinalize&&!complete))throw new Error('Group statement readiness does not reconcile.');return r;
}
export function consolidationCsv(r:Consolidation,label='Prepared consolidation'):string{
 parseConsolidation(r,{group:r.groupId,from:r.from,through:r.through});const money=(v:string)=>{signedCents(v);return '"'+v+'"';};
 const rows=[['Evidence',label,'Group',r.groupName,'Currency',r.currency,'From',r.from,'Through',r.through].map(csvCell).join(','),['Revision',r.revision,'Basis','Signed debit less credit; income excludes identified fiscal closing transfers'].map(csvCell).join(','),['Code','Account','Type','Translated entity balances','Automatic eliminations','Approved adjustments','Translation adjustment','Consolidated balance','Period income activity'].map(csvCell).join(',')];
 for(const a of r.rows)rows.push([csvCell(a.code),csvCell(a.name),csvCell(a.accountType),...[a.sourceClosing,a.automaticClosing,a.adjustmentClosing,a.translationClosing,a.closing,a.income].map(money)].join(','));rows.push([csvCell('Net income'),money(r.netIncome)].join(','));return rows.join('\r\n')+'\r\n';
}
export const statementTotal=(r:Consolidation,type:Consolidation['rows'][number]['accountType'],basis:'closing'|'income',sign=1n)=>decimal(r.rows.filter(a=>a.accountType===type).reduce((sum,a)=>sum+signedCents(a[basis])*sign,0n));
export const groupAttestations=[['ownership_and_periods_reviewed','Wholly owned membership and reporting dates reviewed'],['fx_policy_reviewed','Functional currencies, rate sources and translation policy reviewed'],['eliminations_reviewed','Intercompany, investment and other eliminations reviewed']] as const;
export const downloadFinanceEvidence=(name:string,content:string,type='application/json')=>{const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
