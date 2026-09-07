import assert from 'node:assert/strict';

// Synthetic book policies exercise the browser, authenticated APIs and restore path.
export async function qualifyCloseWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email,password}){
 const entity=await rpc(clientA,'create_tenant_entity',{p_name:'Fiscal close acceptance entity',p_currency:'USD',p_reason:'Synthetic close acceptance',p_idempotency_key:'close-entity'});
 const account=async(code,type)=>rpc(clientA,'create_tenant_account',{p_code:code,p_name:'Close acceptance '+code,p_account_type:type,p_parent_id:null,p_reason:'Synthetic close control',p_idempotency_key:'close-account-'+code});
 const capital=await account('3005','equity'),prepaid=await account('1395','asset'),fixed=await account('1885','asset'),accumulated=await account('1895','asset'),retained=await account('3105','equity'),accrued=await account('2455','liability');
 for(const year of ['2025','2026'])await rpc(clientA,'create_accounting_period',{p_entity_id:entity,p_period_start:year+'-01-01',p_period_end:year+'-12-31',p_idempotency_key:'close-year-'+year});
 await rpc(clientA,'configure_entity_invoice_accounts',{p_entity_id:entity,p_ar_account_id:ids.ar,p_revenue_account_id:ids.revenue,p_idempotency_key:'close-ar'});
 await rpc(clientA,'configure_entity_customer_receipt_accounts',{p_entity_id:entity,p_cash_account_id:ids.cash,p_idempotency_key:'close-cash'});
 const post=async(number,date,debit,credit,amount)=>rpc(clientA,'post_manual_journal',{p_entity_id:entity,p_entry_number:number,p_entry_date:date,p_memo:'Synthetic close source',p_lines:[{account_id:debit,debit:amount,credit:'0.00'},{account_id:credit,debit:'0.00',credit:amount}],p_idempotency_key:number});
 await post('CLOSE-CAPITAL','2025-01-01',ids.cash,capital,'50000.00');
 await post('CLOSE-INCOME','2025-01-02',ids.cash,ids.revenue,'50000.00');
 await post('CLOSE-PREPAID','2025-01-03',prepaid,ids.cash,'3650.00');
 await post('CLOSE-FIXED','2025-01-03',fixed,ids.cash,'36500.00');
 const sources=await rpc(clientA,'get_schedule_acquisitions',{p_entity:entity,p_search:'CLOSE-'});assert.equal(sources.hasMore,false);assert.equal(sources.rows.length,2);
 let sequence=0;
 const request=(kind,payload)=>rpc(clientA,'request_finance_action',{p_entity_id:entity,p_kind:kind,p_payload:payload,p_reason:'Synthetic reviewed financial policy',p_key:'close-action-'+(++sequence)});
 const approve=async(kind,payload)=>rpc(clientReviewer,'decide_finance_action',{p_request_id:await request(kind,payload),p_decision:'APPROVE',p_reason:'Independent close evidence review'});
 await approve('APPROVAL_POLICY',{journals_required:true,payments_required:true,expected_version:0});
 const page=await browser.newPage(),failures=[];page.on('pageerror',e=>failures.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/auth');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByText('Journal-linked posted invoices',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:4173/finance-schedules');await page.getByLabel('Schedule entity',{exact:true}).selectOption(entity);await page.getByText('Create a finance schedule',{exact:true}).click();
  const form=page.getByRole('form',{name:'Request asset schedule',exact:true});
  for(const [label,value] of [['Schedule reference','Acceptance prepaid'],['Service or in-service date','2025-01-03'],['Final service or useful-life date','2025-12-31'],['Acquisition and useful-life evidence','Approved daily book allocation from in-service date']])await form.getByLabel(label,{exact:true}).fill(value);
  await form.getByLabel('Acquisition journal debit',{exact:true}).selectOption(sources.rows.find(r=>r.accountId===prepaid).id);await form.getByLabel('Expense account',{exact:true}).selectOption(ids.expense);
  await form.getByRole('button',{name:'Request asset schedule',exact:true}).click();await form.getByRole('status').waitFor();
  const pending=(await clientA.from('finance_requests').select('id').eq('entity_id',entity).eq('kind','SCHEDULE_CREATE')).data[0].id;
  const first=(await rpc(clientReviewer,'decide_finance_action',{p_request_id:pending,p_decision:'APPROVE',p_reason:'Independent prepaid acquisition review'})).scheduleId;
  const asset=(await approve('SCHEDULE_CREATE',{reference:'Acceptance fixed asset',kind:'FIXED_ASSET',starts_on:'2025-01-03',ends_on:'2025-12-31',source_line_id:sources.rows.find(r=>r.accountId===fixed).id,salvage:'0.00',expense_account_id:ids.expense,accumulated_account_id:accumulated})).scheduleId;
  const recurring=(await approve('SCHEDULE_CREATE',{reference:'Acceptance monthly accrual',kind:'RECURRING',starts_on:'2025-01-31',ends_on:'2025-12-31',cycle_months:1,lines:[{account_id:ids.expense,debit:'100.00',credit:'0.00'},{account_id:accrued,debit:'0.00',credit:'100.00'}]})).scheduleId;
  const accrual=(await approve('SCHEDULE_CREATE',{reference:'Acceptance year-end accrual',kind:'ACCRUAL',starts_on:'2025-12-31',ends_on:'2026-01-01',lines:[{account_id:ids.expense,debit:'500.00',credit:'0.00'},{account_id:accrued,debit:'0.00',credit:'500.00'}]})).scheduleId;
  await page.reload();await page.getByLabel('Schedule entity',{exact:true}).selectOption(entity);await page.getByLabel('Schedule',{exact:true}).selectOption(first);await page.getByLabel('Schedule report as of',{exact:true}).fill('2025-12-31');
  const run=page.getByRole('form',{name:'Request schedule posting',exact:true});await run.getByLabel('Post schedule through',{exact:true}).fill('2025-12-31');await run.getByLabel('Schedule run evidence',{exact:true}).fill('Verified annual service allocation');await run.getByRole('button',{name:'Request schedule posting',exact:true}).click();await run.getByRole('status').waitFor();
  const runRequest=(await clientA.from('finance_requests').select('id').eq('entity_id',entity).eq('kind','SCHEDULE_RUN')).data[0].id;
  const runDecision={p_request_id:runRequest,p_decision:'APPROVE',p_reason:'Concurrent schedule approval'};
  const concurrent=await Promise.all([rpc(clientReviewer,'decide_finance_action',runDecision),rpc(clientReviewer,'decide_finance_action',runDecision)]);assert.deepEqual(concurrent[0],concurrent[1]);
  for(const id of [asset,recurring,accrual])await approve('SCHEDULE_RUN',{schedule_id:id,date:'2025-12-31'});
  for(const id of [first,asset]){const r=await rpc(clientA,'get_finance_schedule',{p_schedule:id,p_as_of:'2025-12-31'});assert.equal(r.carryingValue,'0.00');assert.ok(r.controls.every(c=>c.variance==='0.00'));}
  const register=await rpc(clientA,'create_cash_register',{p_entity_id:entity,p_account_id:ids.cash,p_name:'Fiscal acceptance bank'});
  const statement=await rpc(clientA,'import_cash_statement',{p_register_id:register,p_statement:{reference:'Synthetic full-year bank',starts_on:'2025-01-01',ends_on:'2025-12-31',opening:'0.00',closing:'59850.00',lines:[['2025-01-01','50000.00','CLOSE-CAPITAL'],['2025-01-02','50000.00','CLOSE-INCOME'],['2025-01-03','-3650.00','CLOSE-PREPAID'],['2025-01-03','-36500.00','CLOSE-FIXED']].map(([booked_on,amount,reference])=>({external_id:reference,booked_on,amount,reference,description:'Synthetic bank source'}))},p_key:'close-bank'});
  let bank=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement});
  for(const line of bank.lines){bank=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement});const book=bank.bookLines.find(b=>b.amount===line.amount&&b.date===line.date);assert.ok(book);await rpc(clientA,'match_cash_statement',{p_statement_id:statement,p_bank_lines:[line.id],p_book_lines:[book.id],p_reason:'Verified bank and book source',p_revision:bank.revision});}
  const review=await rpc(clientA,'request_cash_review',{p_statement_id:statement,p_action:'CLOSE',p_reason:'Complete fiscal bank source',p_revision:(await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement})).revision});await rpc(clientReviewer,'decide_cash_review',{p_review_id:review,p_decision:'APPROVE',p_reason:'Independent bank completeness review'});
  const closeArgs={p_entity:entity,p_from:'2025-01-01',p_through:'2025-12-31'};assert.equal((await rpc(clientA,'get_finance_close_check',closeArgs)).canClose,true);
  await page.goto('http://127.0.0.1:4173/finance-close');await page.getByLabel('Close entity',{exact:true}).selectOption(entity);await page.getByLabel('Close period starts',{exact:true}).fill('2025-01-01');await page.getByLabel('Close period ends',{exact:true}).fill('2025-12-31');await page.getByText('Automated close checks passed.',{exact:true}).waitFor();await page.getByText('Period net income: 8150.00 USD',{exact:true}).waitFor();
  await page.getByText('Close the fiscal year to retained earnings',{exact:true}).click();const closing=page.getByRole('form',{name:'Request fiscal year close',exact:true});await closing.getByLabel('Retained earnings account',{exact:true}).selectOption(retained);await closing.getByLabel('Fiscal close supporting evidence',{exact:true}).fill('Reviewed annual book policies and bank completeness');for(const checkbox of await closing.getByRole('checkbox').all())await checkbox.check();await closing.getByRole('button',{name:'Request fiscal year close',exact:true}).click();await closing.getByRole('status').waitFor();
  const closeRequest=(await clientA.from('finance_requests').select('id').eq('entity_id',entity).eq('kind','FISCAL_YEAR_CLOSE')).data[0].id;
  const decision={p_request_id:closeRequest,p_decision:'APPROVE',p_reason:'Independent fiscal year acceptance'},result=await rpc(clientReviewer,'decide_finance_action',decision);assert.deepEqual(await rpc(clientReviewer,'decide_finance_action',decision),result);
  const trial=await rpc(clientA,'get_entity_trial_balance',{p_entity_id:entity,p_from_date:'2025-01-01',p_to_date:'2025-12-31'});assert.equal(trial.rows.find(r=>r.accountId===retained).closingCredit,'8150.00');assert.ok(trial.fiscalClosingActivity.length>=3);
  await page.getByRole('button',{name:'Refresh close checks',exact:true}).click();await page.getByText('Period net income: 8150.00 USD',{exact:true}).waitFor();
  await approve('SCHEDULE_RUN',{schedule_id:accrual,date:'2026-01-01'});const next=await rpc(clientA,'get_finance_schedule',{p_schedule:accrual,p_as_of:'2026-01-01'});assert.equal(next.entries.filter(e=>e.kind==='REVERSAL').length,1);
  assert.ok((await clientB.rpc('get_finance_close_check',closeArgs)).error);assert.ok((await clientB.rpc('get_finance_schedule',{p_schedule:first,p_as_of:'2025-12-31'})).error);
  await page.route('**/rest/v1/rpc/get_finance_close_check',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic close report outage'})}));await page.getByRole('button',{name:'Refresh close checks',exact:true}).click();await page.getByRole('alert').filter({hasText:'Close checks unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Export close evidence',exact:true}).count(),0);
  assert.deepEqual(failures,[]);return {entity,schedules:[first,asset,recurring,accrual],decision,result};
 }finally{await page.close();}
}
