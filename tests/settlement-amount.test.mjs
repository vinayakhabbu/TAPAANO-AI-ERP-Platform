import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { prepareSettlement } = await loadTypescript("../../src/lib/settlementAmount.ts");
const input = { documentId: "document", number: "  R-1  ", date: "2026-09-07", issueDate: "2026-09-06", currency: "USD", amount: "9999999999999.99", reference: " Synthetic receipt ", requestKey: "retry-key" };
test("settlement payload preserves exact cents and immutable retry identity", () => {
  const result=prepareSettlement(input);
  assert.equal(result.p_amount,"9999999999999.99");assert.equal(result.p_idempotency_key,"retry-key");
  assert.equal(result.number,"R-1");assert.equal(result.p_reference,"Synthetic receipt");
  assert.deepEqual(prepareSettlement(input),result);
  assert.equal(prepareSettlement({...input,amount:"0.1"}).p_amount,"0.10");
});
test("settlement input rejects invalid precision, zero, excessive amounts and invalid effective dates",()=>{
  for(const amount of ["0","0.00","-1","0.001","1e3","NaN","Infinity","10000000000000","1,000.00"]) assert.throws(()=>prepareSettlement({...input,amount}));
  for(const date of ["2026-09-05","2026-02-30","infinity",""]) assert.throws(()=>prepareSettlement({...input,date}));
  for(const change of [{number:""},{number:"bad\nref"},{reference:"x".repeat(241)},{currency:"usd"},{requestKey:""}]) assert.throws(()=>prepareSettlement({...input,...change}));
});
