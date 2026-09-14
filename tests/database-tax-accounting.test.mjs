import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call} from './helpers/finance-workflows.mjs';
const taxAccounts={sales_account:'30000000-0000-4000-8000-000000000091',recoverable_account:'30000000-0000-4000-8000-000000000092',expense_account:'30000000-0000-4000-8000-000000000093'};
const liability='30000000-0000-4000-8000-000000000094',deferred='30000000-0000-4000-8000-000000000095',unbilled='30000000-0000-4000-8000-000000000096';let seq=0;
async function approve(db,kind,payload){await actor(db,ids.adminA);const req=await call(db,'request_finance_action',ids.entityA,kind,payload,'Synthetic original accounting evidence','tax-'+(++seq));await actor(db,reviewer);const result=await call(db,'decide_finance_action',req,'APPROVE','Independent source review');await actor(db,ids.adminA);return {req,...result};}
const assessment=(amount='10.00',treatment='SALES',basis='100.00')=>({source:'REVIEWED',reference:'SYNTHETIC-ASSESSMENT',assessed_on:'2026-01-01',evidence:'Synthetic assessed tax; no real jurisdiction rate asserted',lines:[{line_number:1,jurisdiction:'US-TEST',treatment,basis,amount}]});
const payload=(party=ids.customerA,net='100.00',tax=assessment())=>({party_id:party,number:'ASSESSED-'+(++seq),date:'2026-01-01',due_date:'2026-01-31',notes:'Synthetic assessed document',lines:[{description:'Service',quantity:'1',unit_price:net}],tax});
const register=db=>call(db,'get_tax_register',ids.entityA,'2026-01-01','2026-12-31');
async function database(){const db=await financeDatabase();await db.exec(`RESET ROLE;INSERT INTO public.accounts VALUES('${taxAccounts.sales_account}','${ids.orgA}','2390','Sales tax payable','liability',true),('${taxAccounts.recoverable_account}','${ids.orgA}','1390','Recoverable purchase tax','asset',true),('${taxAccounts.expense_account}','${ids.orgA}','6390','Nonrecoverable purchase tax','expense',true),('${liability}','${ids.orgA}','2391','Customer credits','liability',true),('${deferred}','${ids.orgA}','2392','Deferred contracts','liability',true),('${unbilled}','${ids.orgA}','1391','Unbilled contracts','asset',true);SET ROLE authenticated`);await approve(db,'TAX_POLICY',taxAccounts);await approve(db,'CUSTOMER_CREDIT_POLICY',{liability_account_id:liability});await call(db,'create_cash_register',ids.entityA,ids.cashA,'Confirmed bank');return db;}
test('tax-inclusive invoices settle their gross amount while revenue and jurisdiction liabilities remain separate',async()=>{const db=await database();try{
 const p=payload(),posted=await approve(db,'TAX_INVOICE',p);let r=await register(db);assert.equal(r.documents[0].subtotal,'100.00');assert.equal(r.documents[0].tax,'10.00');assert.equal(r.documents[0].total,'110.00');assert.equal(r.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'10.00');assert.equal(r.reconciled,true);
 await call(db,'post_customer_receipt_amount',posted.invoiceId,'TAX-RECEIPT','2026-01-02','USD','Confirmed receipt','tax-receipt','110.00');
 const adjustments=await call(db,'get_customer_adjustments',ids.entityA,'2026-01-02');assert.equal(adjustments.invoices[0].remaining,'0.00');assert.equal(adjustments.invoices[0].lines[0].original,'110.00');assert.equal(adjustments.invoices[0].lines[0].netAvailable,'100.00');
 await actor(db,reviewer);assert.deepEqual(await call(db,'decide_finance_action',posted.req,'APPROVE','Independent source review'),{invoiceId:posted.invoiceId});
 const ledger=await call(db,'get_entity_trial_balance',ids.entityA,'2026-01-01','2026-01-02');assert.ok(JSON.stringify(ledger).includes('100.00'));
}finally{await db.close();}});
test('paid invoice credits consume net and original tax cents exactly and dated correction restores both',async()=>{const db=await database();try{
 const {invoiceId}=await approve(db,'TAX_INVOICE',payload());await call(db,'post_customer_receipt_amount',invoiceId,'TAX-PAID','2026-01-02','USD','Confirmed payment','tax-paid','110.00');
 const line=(await call(db,'get_customer_adjustments',ids.entityA,'2026-01-02')).invoices[0].lines[0].id;
 const first=await approve(db,'CUSTOMER_CREDIT',{invoice_id:invoiceId,reference:'NET-30.03',date:'2026-01-03',lines:[{line_id:line,amount:'30.03'}]});assert.equal(first.amount,'33.03');
 const second=await approve(db,'CUSTOMER_CREDIT',{invoice_id:invoiceId,reference:'NET-69.97',date:'2026-01-04',lines:[{line_id:line,amount:'69.97'}]});assert.equal(second.amount,'76.97');
 let r=await register(db);assert.equal(r.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'0.00');assert.equal(r.reconciled,true);
 await assert.rejects(approve(db,'CUSTOMER_CREDIT',{invoice_id:invoiceId,reference:'EXCESS',date:'2026-01-05',lines:[{line_id:line,amount:'0.01'}]}),/exceed/);
 await approve(db,'CUSTOMER_CREDIT_REVERSE',{credit_id:second.creditId,date:'2026-01-06'});r=await register(db);assert.equal(r.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'7.00');assert.equal(r.reconciled,true);
 const historical=await call(db,'get_tax_register',ids.entityA,'2026-01-01','2026-01-04');assert.equal(historical.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'0.00');
}finally{await db.close();}});
test('supplier taxes split recoverable tax and expensed cost, and approved full credits reverse every original line',async()=>{const db=await database();try{
 const tax=assessment('10.00','EXPENSE');tax.lines.push({line_number:1,jurisdiction:'US-RECOVERABLE',treatment:'RECOVERABLE',basis:'100.00',amount:'5.00'});
 const {billId}=await approve(db,'TAX_BILL',payload(ids.vendorA,'100.00',tax));let r=await register(db);assert.equal(r.documents[0].total,'115.00');assert.equal(r.controls.find(c=>c.accountId===taxAccounts.recoverable_account).expected,'5.00');assert.equal(r.reconciled,true);
 await assert.rejects(call(db,'post_supplier_bill_credit',billId,'DIRECT','2026-01-02','Direct tax credit','direct-tax-credit'),/independent/);
 await approve(db,'TAX_DOCUMENT_CREDIT',{document_id:r.documents[0].id,number:'SUPPLIER-TAX-CREDIT',date:'2026-01-02'});r=await register(db);assert.equal(r.controls.find(c=>c.accountId===taxAccounts.recoverable_account).expected,'0.00');assert.equal(r.reconciled,true);
}finally{await db.close();}});
test('contract billing and concessions exclude collected tax from earned and deferred revenue',async()=>{const db=await database();try{
 const {contractId}=await approve(db,'CONTRACT_CREATE',{customer_id:ids.customerA,reference:'TAX-CONTRACT',kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-01-31',cycle_months:0,price:'310.00',timezone:'UTC',deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'service',description:'Daily service',standalone_price:'310.00',method:'DAILY'}]});
 let report=await call(db,'get_contract_finance',contractId,'2026-01-31');const cycle=report.cycles[0].id;
 const {invoiceId}=await approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'CONTRACT-TAX',issue_date:'2026-01-01',due_date:'2026-01-31',tax:assessment('31.00','SALES','310.00')});
 await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-10',evidence:[]});const line=(await call(db,'get_customer_adjustments',ids.entityA,'2026-01-10')).invoices.find(i=>i.id===invoiceId).lines[0].id;
 await approve(db,'CUSTOMER_CREDIT',{invoice_id:invoiceId,reference:'CONTRACT-CONCESSION',date:'2026-01-11',lines:[{line_id:line,amount:'31.00'}]});
 report=await call(db,'get_contract_finance',contractId,'2026-01-11');assert.equal(report.billed,'279.00');assert.equal(report.recognized,'90.00');assert.equal(report.deferred,'189.00');assert.ok(report.controls.every(c=>c.variance==='0.00'));assert.equal((await register(db)).controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'27.90');
 await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-31',evidence:[]});report=await call(db,'get_contract_finance',contractId,'2026-01-31');assert.equal(report.recognized,'279.00');assert.equal(report.deferred,'0.00');
}finally{await db.close();}});
test('tax settlement confirmation and linked correction preserve the dated tax register',async()=>{const db=await database();try{
 await approve(db,'TAX_INVOICE',payload());const s=await approve(db,'TAX_SETTLE',{kind:'SALES_PAYMENT',date:'2026-01-02',amount:'10.00',cash_account:ids.cashA,reference:'CONFIRMED-TAX-REMITTANCE'});let r=await register(db);assert.equal(r.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'0.00');assert.equal(r.reconciled,true);
 await assert.rejects(call(db,'reverse_posted_journal',s.journalId,'2026-01-03','Standalone reversal','standalone-tax'),/linked independent/);
 await approve(db,'TAX_SETTLEMENT_REVERSE',{settlement_id:s.settlementId,date:'2026-01-03'});r=await register(db);assert.equal(r.controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'10.00');assert.equal(r.reconciled,true);
}finally{await db.close();}});
test('tax-required subscriptions preserve net earned service and original tax when canceling mid-cycle',async()=>{const db=await database();try{
 const {contractId}=await approve(db,'CONTRACT_CREATE',{customer_id:ids.customerA,reference:'TAX-SUBSCRIPTION',kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-02-28',cycle_months:1,price:'310.00',timezone:'UTC',tax_required:true,deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'service',description:'Daily service',standalone_price:'310.00',method:'DAILY'}]});
 const cycle=(await call(db,'get_contract_finance',contractId,'2026-01-31')).cycles[0].id;
 await assert.rejects(approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'NO-ASSESSMENT',issue_date:'2026-01-01',due_date:'2026-01-31'}),/fresh tax/);
 const {invoiceId}=await approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'SUBSCRIPTION-TAX',issue_date:'2026-01-01',due_date:'2026-01-31',tax:assessment('31.00','SALES','310.00')});
 await call(db,'post_customer_receipt_amount',invoiceId,'SUBSCRIPTION-PAID','2026-01-02','USD','Paid subscription','subscription-tax-paid','341.00');
 const change=await approve(db,'SUBSCRIPTION_CHANGE',{contract_id:contractId,action:'CANCEL',effective_on:'2026-01-16',credit_reference:'TAX-CANCEL'});assert.equal(change.unusedCredit,'160.00');
 const report=await call(db,'get_contract_finance',contractId,'2026-01-31');assert.equal(report.billed,'150.00');assert.equal(report.recognized,'150.00');assert.equal(report.deferred,'0.00');
 const credits=await call(db,'get_customer_adjustments',ids.entityA,'2026-01-31');assert.equal(credits.credits[0].amount,'176.00');assert.equal(credits.control.reconciled,true);assert.equal((await register(db)).controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'15.00');
}finally{await db.close();}});
test('tax assessments reject omitted or duplicate lines, direct tax posting and foreign tenant access',async()=>{const db=await database();try{
 const p=payload();p.tax.lines.push({...p.tax.lines[0]});await assert.rejects(approve(db,'TAX_INVOICE',p),/duplicate/);
 p.tax.lines=[];await assert.rejects(approve(db,'TAX_INVOICE',p),/assessment|source line/);
 await assert.rejects(call(db,'post_customer_invoice',ids.entityA,ids.customerA,'DIRECT-TAX','2026-01-01','2026-01-31','USD',10,'Direct tax',[{description:'Service',quantity:'1',unit_price:'100.00'}],'direct-tax'),/zero-tax/);
 await assert.rejects(db.exec('SELECT * FROM public.finance_tax_documents'),/permission denied/);
 await assert.rejects(call(db,'tax_assessment',ids.entityA,'AR','2026-01-01',payload().lines,assessment()),/permission denied/);
 await actor(db,ids.adminB);await assert.rejects(register(db),/scope/);
}finally{await db.close();}});
test('tax register and close refuse damaged retained tax sources',async()=>{const db=await database();try{
 const {invoiceId}=await approve(db,'TAX_INVOICE',payload());await db.exec('RESET ROLE;SET session_replication_role=replica');await db.query("UPDATE public.finance_tax_documents SET assessment=jsonb_set(assessment,'{lines,0,amount}','\"9.00\"') WHERE invoice_id=$1",[invoiceId]);await db.exec('SET session_replication_role=origin;SET ROLE authenticated');
 await assert.rejects(register(db),/graph|approval/);await assert.rejects(call(db,'get_finance_close_check',ids.entityA,'2026-01-01','2026-01-31'),/graph|approval/);
}finally{await db.close();}});
test('tax-required revisions, supplemental invoices and subsequent credits retain net revenue and exact gross sources',async()=>{const db=await database();try{
 const {contractId}=await approve(db,'CONTRACT_CREATE',{customer_id:ids.customerA,reference:'TAX-REVISED',kind:'FIXED',starts_on:'2026-01-01',ends_on:'2026-01-31',cycle_months:0,price:'310.00',unit_price:'0.00',timezone:'UTC',tax_required:true,deferred_account_id:deferred,unbilled_account_id:unbilled,obligations:[{key:'service',description:'Service',standalone_price:'310.00',method:'DAILY'}]});const cycle=(await call(db,'get_contract_finance',contractId,'2026-01-31')).cycles[0].id;
 await approve(db,'CONTRACT_BILL',{cycle_id:cycle,number:'TAX-REV-BASE',issue_date:'2026-01-01',due_date:'2026-01-31',tax:assessment('31.00','SALES','310.00')});await approve(db,'CONTRACT_RECOGNIZE',{cycle_id:cycle,as_of:'2026-01-10',evidence:[]});
 await approve(db,'CONTRACT_REVISE',{cycle_id:cycle,date:'2026-01-11',price:'500.00',reference:'TAX-REVISION',policy_evidence:'Synthetic non-distinct modification',variable_consideration:'Synthetic enforceability and constraint review',obligations:[{key:'service',amount:'500.00',treatment:'CATCH_UP',method:'PERCENT_COMPLETE',starts_on:'2026-01-01',ends_on:'2026-01-31',progress:'80',evidence:'Synthetic measured completion'}]});const {invoiceId}=await approve(db,'CONTRACT_SUPPLEMENT_BILL',{cycle_id:cycle,number:'TAX-SUPPLEMENT',issue_date:'2026-01-12',due_date:'2026-01-31',amount:'190.00',tax:assessment('19.00','SALES','190.00')});
 const line=(await call(db,'get_customer_adjustments',ids.entityA,'2026-01-31')).invoices.find(i=>i.id===invoiceId).lines[0].id;assert.equal((await approve(db,'CUSTOMER_CREDIT',{invoice_id:invoiceId,reference:'TAX-REV-CREDIT',date:'2026-01-13',lines:[{line_id:line,amount:'100.00'}]})).amount,'110.00');const r=await call(db,'get_contract_finance',contractId,'2026-01-31');assert.deepEqual([r.billed,r.recognized,r.deferred,r.unbilled],['400.00','320.00','80.00','0.00']);assert.ok(r.controls.every(c=>c.variance==='0.00'));assert.equal((await register(db)).controls.find(c=>c.accountId===taxAccounts.sales_account).expected,'40.00');
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false)");await call(db,'validate_contract_graph',contractId);const docs=(await db.query('SELECT id FROM public.finance_tax_documents')).rows;for(const d of docs)await call(db,'validate_tax_document_graph',d.id);
 await db.exec('SET session_replication_role=replica');await db.query("UPDATE public.invoice_lines SET description='Changed source description' WHERE id=$1",[line]);await db.exec('SET session_replication_role=origin');await assert.rejects(call(db,'validate_contract_graph',contractId),/line terms/);
}finally{await db.close();}});
