import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTypescript} from './helpers/load-typescript.mjs';
const {parseBankCsv}=await loadTypescript('../../src/lib/bankCsv.ts');
const header='external_id,booked_on,description,reference,amount\r\n';
test('statement CSV preserves exact large amounts and quoted references without interpreting cells',()=>{
 const rows=parseBankCsv('\uFEFF'+header+'bank-1,2026-09-01,"Deposit, client ""A""","=UNTRUSTED()",9999999999999.99\r\nbank-2,2026-09-02,"Fee\nwith detail",ref,-0.01\r\n');
 assert.equal(rows[0].amount,'9999999999999.99');assert.equal(rows[0].reference,'=UNTRUSTED()');assert.equal(rows[0].description,'Deposit, client "A"');
 assert.equal(rows[1].description,'Fee\nwith detail');assert.equal(rows[1].amount,'-0.01');
});
test('statement CSV rejects ambiguous formats, duplicate rows, bad dates and inexact amounts',()=>{
 for(const csv of ['date,amount\n2026-09-01,1',header+'x,2026-02-30,a,b,1',header+'x,2026-09-01,a,b,1e2',header+'x,2026-09-01,a,b,0',header+'x,2026-09-01,a,b,1.001',header+'x,2026-09-01,"unclosed,b,1',header+'x,2026-09-01,"a"broken,b,1',header+'x,2026-09-01,a,b,1\nx,2026-09-02,a,b,1']) assert.throws(()=>parseBankCsv(csv));
 assert.deepEqual(parseBankCsv(header),[]);
});
