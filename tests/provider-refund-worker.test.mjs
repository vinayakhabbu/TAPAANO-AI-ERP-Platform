import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {loadTypescript} from './helpers/load-typescript.mjs';
import {stripeRefundFixture} from './helpers/stripe-refund-fixture.mjs';
const {createProviderRefundWorker,stripeInteger}=await loadTypescript('../../supabase/functions/_shared/providerRefundWorker.ts');
const {parseProviderJson}=await loadTypescript('../../supabase/functions/_shared/providerJson.ts');
const token='synthetic_provider_worker_'+randomUUID(),connection=randomUUID();
const request=(auth=token,body={})=>new Request('https://erp.example/functions/v1/provider-refund-worker',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
function harness(){
 const fixture=stripeRefundFixture(),observations=[],marks=[],releases=[],calls=[];
 const claim={jobId:randomUUID(),connectionId:connection,leaseToken:randomUUID(),environment:'TEST',accountId:'acct_acceptance',invoiceId:'in_acceptance',receiptAmount:'100.00',amount:'20.00',approvalDigest:'a'.repeat(32),providerId:null,recoveryId:null,preflight:null,dispatchStartedAt:null,mayDispatch:true};
 const deps={token,secrets:{[connection]:{environment:'TEST',accountId:'acct_acceptance',secretKey:'sk_test_syntheticcredential'}},fetch:fixture.fetch,rpc:async(name,args)=>{
  calls.push({name,args});if(name==='claim_provider_refund')return {...claim};if(name==='mark_provider_refund_dispatch'){marks.push(args);claim.preflight=args.p_preflight;claim.dispatchStartedAt??=new Date().toISOString();return {maySend:true,startedAt:claim.dispatchStartedAt};}if(name==='record_provider_refund_observation'){observations.push(args);claim.providerId=args.p_proof.id;return {observationId:randomUUID(),status:args.p_proof.status};}if(name==='release_provider_refund'){releases.push(args);return null;}throw Error('Unexpected worker RPC');
 }};return {fixture,claim,deps,observations,marks,releases,calls};
}
test('refund worker rejects authentication, arbitrary request fields and credential scope before provider access',async()=>{
 const h=harness(),worker=createProviderRefundWorker(h.deps);assert.equal((await worker(request('wrong'))).status,401);assert.equal(h.calls.length,0);assert.equal((await worker(request(token,{amount:'999.99',url:'https://attacker.example'}))).status,400);assert.equal(h.calls.length,0);
 h.deps.secrets[connection].environment='LIVE';assert.equal((await worker(request())).status,503);assert.equal(h.fixture.state.calls.length,0);assert.equal(h.releases[0].p_error,'CONFIGURATION');
});
test('Stripe integer amounts preserve cents and reject float-shaped, quoted, forged and out-of-range numeric tokens',()=>{
 for(const [input,expected] of [['0',0n],['-2001',-2001n],['999999999999999',999999999999999n]])assert.equal(stripeInteger(parseProviderJson(input)),expected);
 for(const value of ['1.1','1e2','1000000000000000','"2000"','{"decimal":"2000"}'])assert.throws(()=>stripeInteger(parseProviderJson(value)));
});
test('refund dispatch binds the original invoice payment, freezes the idempotency key and records both provider and balance evidence',async()=>{
 const h=harness();assert.equal((await createProviderRefundWorker(h.deps)(request())).status,200);assert.equal(h.fixture.state.posts.length,1);assert.equal(h.fixture.state.posts[0].key,'tapaano-refund-'+h.claim.jobId);const p=h.observations[0].p_proof;assert.equal(p.amount,'20.00');assert.equal(p.balance.amount,'-20.00');assert.equal(p.jobId,h.claim.jobId);assert.equal(p.approvalDigest,h.claim.approvalDigest);assert.equal(h.marks.length,1);assert.match(h.observations[0].p_body_sha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(h.observations).includes('sk_test_'));
});
test('lost dispatch and persistence responses recover exactly without a second provider POST',async()=>{
 const h=harness();h.fixture.state.losePost=true;const worker=createProviderRefundWorker(h.deps);assert.equal((await worker(request())).status,503);assert.equal(h.releases.at(-1).p_error,'DISPATCH_UNCERTAIN');assert.equal((await worker(request())).status,200);assert.equal(h.fixture.state.posts.length,1);
 const next=harness(),base=next.deps.rpc;let loseMark=true,loseObservation=true;next.deps.rpc=async(name,args)=>{const result=await base(name,args);if(name==='mark_provider_refund_dispatch'&&loseMark){loseMark=false;throw Error('Lost durable dispatch mark');}if(name==='record_provider_refund_observation'&&loseObservation){loseObservation=false;throw Error('Lost committed observation');}return result;};
 assert.equal((await createProviderRefundWorker(next.deps)(request())).status,200);assert.deepEqual(next.marks[0],next.marks[1]);assert.deepEqual(next.observations[0],next.observations[1]);assert.equal(next.fixture.state.posts.length,1);
});
test('an expired provider idempotency window never creates a fresh refund when recovery finds none',async()=>{
 const h=harness(),base=h.deps.rpc;h.deps.rpc=async(name,args)=>name==='mark_provider_refund_dispatch'?{maySend:false,startedAt:'2026-01-01T00:00:00Z'}:base(name,args);
 const response=await createProviderRefundWorker(h.deps)(request());assert.equal(response.status,503);assert.equal((await response.json()).code,'RECOVERY_REQUIRED');assert.equal(h.fixture.state.posts.length,0);assert.equal(h.observations.length,0);
});
test('ambiguous allocations, disputes, unexpected fees and mismatched refund ownership cannot produce accounting evidence',async()=>{
 for(const mutate of [h=>h.fixture.state.multiplePayments=true,h=>h.fixture.state.invalidCharge=true,h=>h.fixture.state.fee=1]){const h=harness();mutate(h);const r=await createProviderRefundWorker(h.deps)(request());assert.equal(r.status,503);assert.equal(h.observations.length,0);}
 const h=harness();h.fixture.state.losePost=true;const worker=createProviderRefundWorker(h.deps);await worker(request());h.fixture.state.refund.metadata.tapaano_approval='b'.repeat(32);assert.equal((await worker(request())).status,503);assert.equal(h.observations.length,0);assert.equal(h.fixture.state.posts.length,1);
});
test('successful refunds continue verification after connection disablement and failures retain the returned balance evidence',async()=>{
 const h=harness(),worker=createProviderRefundWorker(h.deps);assert.equal((await worker(request())).status,200);h.claim.mayDispatch=false;h.fixture.state.status='failed';assert.equal((await worker(request())).status,200);assert.equal(h.fixture.state.posts.length,1);assert.equal(h.observations.at(-1).p_proof.failureBalance.amount,'20.00');
});
