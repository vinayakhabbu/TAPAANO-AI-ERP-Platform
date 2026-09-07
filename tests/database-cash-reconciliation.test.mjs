import assert from 'node:assert/strict';
import test from 'node:test';
import {financeDatabase,ids,reviewer,actor,call,journal} from './helpers/finance-workflows.mjs';

const statement = () => ({reference:'September',starts_on:'2026-09-01',ends_on:'2026-09-30',opening:'1000.00',closing:'1082.00',lines:[
  {external_id:'bank-1',booked_on:'2026-09-02',description:'Customer deposit',reference:'remittance',amount:'100.00'},
  {external_id:'bank-2',booked_on:'2026-09-03',description:'Fee',reference:'fee',amount:'-20.00'},
  {external_id:'bank-3',booked_on:'2026-09-04',description:'Interest',reference:'interest',amount:'2.00'},
]});
async function setup(db) {
  await journal(db,'opening','2026-08-31','1000.00');
  await journal(db,'deposit','2026-09-02','100.00');
  await journal(db,'fee','2026-09-03','-20.00');
  await journal(db,'interest','2026-09-04','2.00');
  await journal(db,'in-transit','2026-09-05','50.00');
  const register=await call(db,'create_cash_register',ids.entityA,ids.cashA,'Operating cash');
  const id=await call(db,'import_cash_statement',register,statement(),'statement-1');
  return {register,id};
}
const report=(db,id)=>call(db,'get_cash_reconciliation',id);
async function matchAll(db,id) {
  let r=await report(db,id);
  for(const line of r.lines) {
    r=await report(db,id);
    const match=await call(db,'match_cash_statement',id,[line.id],[r.bookLines.find(x=>x.amount===line.amount).id],'Verified bank reference',r.revision);
    assert.equal(await call(db,'match_cash_statement',id,[line.id],[r.bookLines.find(x=>x.amount===line.amount).id],'Verified bank reference',r.revision),match);
  }
}
test('bank reconciliation reconciles exact control totals, timing items and independent close/reopen',async()=>{
 const db=await financeDatabase(); try {
  const {register,id}=await setup(db);
  assert.equal(await call(db,'import_cash_statement',register,statement(),'statement-1'),id);
  let r=await report(db,id); assert.equal(r.unmatchedCount,3); assert.equal(r.openingVariance,'0.00');
  await assert.rejects(call(db,'request_cash_review',id,'CLOSE','Review',r.revision),/unmatched/);
  await matchAll(db,id); r=await report(db,id);
  assert.deepEqual([r.bookClosing,r.closing,r.outstanding,r.adjustedBank,r.variance],['1132.00','1082.00','50.00','1132.00','0.00']);
  const review=await call(db,'request_cash_review',id,'CLOSE','All bank transactions explained',r.revision);
  await assert.rejects(call(db,'decide_cash_review',review,'APPROVE','Checked'),/independent/);
  await actor(db,reviewer); await call(db,'decide_cash_review',review,'APPROVE','Checked source statement and GL');
  await call(db,'decide_cash_review',review,'APPROVE','Checked source statement and GL');
  await actor(db,ids.adminA); assert.equal((await report(db,id)).status,'APPROVED');
  await assert.rejects(journal(db,'late','2026-09-15','1.00'),/reconciliation is closed/);
  const next={reference:'October',starts_on:'2026-10-01',ends_on:'2026-10-31',opening:'1082.00',closing:'1132.00',lines:[{external_id:'bank-4',booked_on:'2026-10-01',description:'Deposit cleared',reference:'in-transit',amount:'50.00'}]};
  const nextId=await call(db,'import_cash_statement',register,next,'statement-2'); await matchAll(db,nextId);
  assert.equal((await report(db,nextId)).outstanding,'0.00');
  await assert.rejects(call(db,'request_cash_review',id,'REOPEN','Correct cutoff',(await report(db,id)).revision),/later statement/);
  let request=await call(db,'request_cash_review',nextId,'VOID','Duplicate export',(await report(db,nextId)).revision);
  await actor(db,reviewer); await call(db,'decide_cash_review',request,'APPROVE','Reviewed void');
  await actor(db,ids.adminA); request=await call(db,'request_cash_review',id,'REOPEN','Correct cutoff',(await report(db,id)).revision);
  await actor(db,reviewer); await call(db,'decide_cash_review',request,'APPROVE','Reviewed reopening');
  await actor(db,ids.adminA); await journal(db,'late-after-reopen','2026-09-15','1.00');
  assert.equal((await report(db,id)).outstanding,'51.00');
 } finally {await db.close();}
});
test('bank import rejects duplicate and malformed exports atomically and enforces the balance chain',async()=>{
 const db=await financeDatabase(); try {
  const reg=await call(db,'create_cash_register',ids.entityA,ids.cashA,'Cash');
  for(const change of [s=>s.closing='1082.01',s=>s.lines.push(s.lines[0]),s=>s.lines[0].amount='0.001',s=>s.lines[0].booked_on='2026-10-01',s=>s.opening='NaN',s=>s.lines[0].external_id='',s=>s.lines[0].amount=null,s=>s.lines[0].account_number='secret',s=>s.ends_on='infinity']) {
    const s=statement();change(s);await assert.rejects(call(db,'import_cash_statement',reg,s,'bad'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.cash_statements')).rows[0].n,0);
  }
  const id=await call(db,'import_cash_statement',reg,statement(),'good');
  await assert.rejects(call(db,'import_cash_statement',reg,{...statement(),reference:'Changed'},'good'),/idempotency/);
  await assert.rejects(call(db,'import_cash_statement',reg,statement(),'another'),/existing open/);
  assert.equal((await report(db,id)).openingVariance,'-1000.00');
 } finally {await db.close();}
});
test('bank matching prevents stale and cross-tenant changes and preserves rejection and removal evidence',async()=>{
 const db=await financeDatabase(); try {
  const {id}=await setup(db); let r=await report(db,id);
  const line=r.lines[0],book=r.bookLines.find(x=>x.amount===line.amount);
  await assert.rejects(call(db,'match_cash_statement',id,[line.id,line.id],[book.id],'Evidence',r.revision),/duplicate/);
  await assert.rejects(call(db,'match_cash_statement',id,[line.id],[r.bookLines.find(x=>x.amount==='50.00').id],'Evidence',r.revision),/do not match/);
  const m=await call(db,'match_cash_statement',id,[line.id],[book.id],'Evidence',r.revision);
  await assert.rejects(call(db,'match_cash_statement',id,[r.lines[1].id],[r.bookLines.find(x=>x.amount==='-20.00').id],'Evidence',r.revision),/changed/);
  await call(db,'remove_cash_match',m,'Reference corrected');
  r=await report(db,id); assert.equal(r.matches[0].removal_reason,'Reference corrected');
  await matchAll(db,id); const request=await call(db,'request_cash_review',id,'CLOSE','Review',(await report(db,id)).revision);
  await journal(db,'concurrent-after-submit','2026-09-25','1.00');
  await actor(db,reviewer); await assert.rejects(call(db,'decide_cash_review',request,'APPROVE','Checked'),/changed after submission/);
  await call(db,'decide_cash_review',request,'REJECT','New cash posting requires review');
  await actor(db,ids.adminA); assert.equal((await report(db,id)).status,'OPEN');
  for(const who of [ids.adminB,ids.userA]) {
    await actor(db,who); await assert.rejects(call(db,'request_cash_review',id,'CLOSE','Review','invalid'),/unavailable|requires/);
  }
  await actor(db,ids.adminB); await assert.rejects(report(db,id),/unavailable/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.cash_statements')).rows[0].n,0);
  await actor(db,ids.adminA); await assert.rejects(db.query("UPDATE public.cash_statements SET status='APPROVED' WHERE id=$1",[id]),/permission denied/);
  await db.exec('RESET ROLE;SET ROLE service_role');await assert.rejects(report(db,id),/permission denied/);
 } finally {await db.close();}
});
