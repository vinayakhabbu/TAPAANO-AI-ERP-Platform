import assert from 'node:assert/strict';

export async function qualifyCashWorkflow({rpc,clientA,clientB,clientReviewer,browser,ids,email,password}) {
 const entity=await rpc(clientA,'create_tenant_entity',{p_name:'Bank reconciliation acceptance',p_currency:'USD',p_reason:'Synthetic banking acceptance',p_idempotency_key:'cash-test-entity'});
 await rpc(clientA,'create_accounting_period',{p_entity_id:entity,p_period_start:'2026-01-01',p_period_end:'2026-12-31',p_idempotency_key:'cash-test-period'});
 const journal=async(key,date,amount)=>rpc(clientA,'post_manual_journal',{p_entity_id:entity,p_entry_number:key,p_entry_date:date,p_memo:'Synthetic bank acceptance',p_lines:[{account_id:ids.cash,debit:amount,credit:'0.00'},{account_id:ids.revenue,debit:'0.00',credit:amount}],p_idempotency_key:key});
 await journal('CASH-OPEN','2026-08-31','1000.00');await journal('CASH-DEPOSIT','2026-09-02','100.00');await journal('CASH-TIMING','2026-09-03','50.00');
 const page=await browser.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.message));
 await page.goto('http://127.0.0.1:4173/auth');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.getByText('Journal-linked posted invoices',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4173/banking');
 const registerForm=page.getByRole('form',{name:'Create cash register',exact:true});
 await registerForm.getByLabel('Legal entity',{exact:true}).selectOption(entity);await registerForm.getByLabel('Cash GL account',{exact:true}).selectOption(ids.cash);await registerForm.getByLabel('Register name',{exact:true}).fill('Synthetic bank cash');await registerForm.getByRole('button',{name:'Create cash register',exact:true}).click();await registerForm.getByRole('status').waitFor();
 const register=(await clientA.from('cash_registers').select('id').eq('entity_id',entity)).data[0].id;
 const form=page.getByRole('form',{name:'Import bank statement',exact:true});
 await form.getByLabel('Cash register',{exact:true}).selectOption(register);await form.getByLabel('Statement reference',{exact:true}).fill('CASH-SEPTEMBER');await form.getByLabel('Statement starts',{exact:true}).fill('2026-09-01');await form.getByLabel('Statement ends',{exact:true}).fill('2026-09-30');await form.getByLabel('Opening bank balance',{exact:true}).fill('1000.00');await form.getByLabel('Closing bank balance',{exact:true}).fill('1100.00');
 await form.getByLabel('CSV: external_id,booked_on,description,reference,amount',{exact:true}).fill('external_id,booked_on,description,reference,amount\nbank-1,2026-09-02,Customer deposit,remittance,100.00');
 const attempts=[];await page.route('**/rest/v1/rpc/import_cash_statement',async route=>{attempts.push(route.request().postDataJSON());if(attempts.length===1){const result=await route.fetch();assert.equal(result.ok(),true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic lost import response'})});}else await route.continue();});
 await form.getByRole('button',{name:'Import bank statement',exact:true}).click();await form.getByRole('alert').waitFor();await form.getByRole('button',{name:'Retry same request',exact:true}).click();await form.getByRole('status').waitFor();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await page.unroute('**/rest/v1/rpc/import_cash_statement');
 await page.getByLabel('Bank bank-1',{exact:true}).check();await page.getByLabel('Book CASH-DEPOSIT',{exact:true}).check();
 const match=page.getByRole('form',{name:'Match selected transactions',exact:true});await match.getByLabel('Matching evidence',{exact:true}).fill('Same bank remittance');await match.getByRole('button',{name:'Match selected transactions',exact:true}).click();await page.getByText('Unmatched bank transactions: 0',{exact:true}).waitFor();
 const statement=(await clientA.from('cash_statements').select('id').eq('register_id',register)).data[0].id;
 const r=await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement});assert.equal(r.outstanding,'50.00');assert.equal(r.variance,'0.00');
 const matchArgs={p_statement_id:statement,p_bank_lines:r.lines.map(x=>x.id),p_book_lines:r.bookLines.filter(x=>x.number==='CASH-DEPOSIT').map(x=>x.id),p_reason:'Same bank remittance',p_revision:r.revision};
 const retry=await Promise.all([rpc(clientA,'match_cash_statement',matchArgs),rpc(clientA,'match_cash_statement',matchArgs)]);assert.equal(retry[0],retry[1]);
 const reviewForm=page.getByRole('form',{name:'Submit reconciliation review',exact:true});await reviewForm.getByLabel('Requested action',{exact:true}).selectOption('CLOSE');await reviewForm.getByLabel('Reconciliation evidence and reason',{exact:true}).fill('All bank rows matched; one timing deposit');await reviewForm.getByRole('button',{name:'Submit reconciliation review',exact:true}).click();
 await page.getByText('An independent reviewer must decide this request.',{exact:true}).waitFor();
 const review=(await clientA.from('cash_reviews').select('id').eq('statement_id',statement)).data[0].id;
 const decision={p_review_id:review,p_decision:'APPROVE',p_reason:'Compared statement and cash ledger'};
 assert.ok((await clientA.rpc('decide_cash_review',decision)).error);assert.ok((await clientB.rpc('decide_cash_review',decision)).error);
 await rpc(clientReviewer,'decide_cash_review',decision);assert.equal((await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement})).status,'APPROVED');
 assert.ok((await clientB.rpc('get_cash_reconciliation',{p_statement_id:statement})).error);
 assert.deepEqual((await clientB.from('cash_statements').select('id').eq('id',statement)).data,[]);
 assert.ok((await clientA.from('cash_statements').update({status:'APPROVED'}).eq('id',statement)).error);
 const blocked=await clientA.rpc('post_manual_journal',{p_entity_id:entity,p_entry_number:'CASH-LATE',p_entry_date:'2026-09-15',p_memo:'Blocked backdate',p_lines:[{account_id:ids.cash,debit:'1.00',credit:'0.00'},{account_id:ids.revenue,debit:'0.00',credit:'1.00'}],p_idempotency_key:'cash-late'});assert.match(blocked.error?.message??'',/reconciliation is closed/);
 await page.getByRole('button',{name:'Refresh reconciliation',exact:true}).click();await page.getByRole('heading',{name:'CASH-SEPTEMBER · USD · APPROVED',exact:true}).waitFor();assert.deepEqual(failures,[]);await page.close();
 return {statement,revision:(await rpc(clientA,'get_cash_reconciliation',{p_statement_id:statement})).revision};
}
