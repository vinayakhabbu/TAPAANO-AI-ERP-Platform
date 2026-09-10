import {limitedProviderBody,parseProviderJson,providerObject,ProviderNumber} from './providerJson.ts';

export const STRIPE_REFUND_API_VERSION='2026-08-26.dahlia';
export type ProviderRefundSecret={environment:'TEST'|'LIVE';accountId:string;secretKey:string};
type Preflight={invoiceId:string;paymentId:string;paymentIntentId:string;chargeId:string;receiptAmount:string;currency:'USD';accountId:string;environment:'TEST'|'LIVE'};
type Claim={jobId:string;connectionId:string;leaseToken:string;environment:'TEST'|'LIVE';accountId:string;invoiceId:string;receiptAmount:string;amount:string;approvalDigest:string;providerId:string|null;recoveryId:string|null;preflight:Preflight|null;dispatchStartedAt:string|null;mayDispatch:boolean};
type Dependencies={token:string;secrets:Record<string,ProviderRefundSecret>;rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>;fetch?:typeof fetch};
class Failure extends Error{constructor(readonly code:string){super(code);}}
const requireSource=(ok:unknown)=>{if(!ok)throw new Failure('INVALID_SOURCE');};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const sourceId=(v:unknown,prefix:string)=>{requireSource(typeof v==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9]{1,180}$').test(v as string));return v as string;};
export function stripeInteger(v:unknown):bigint{
 if(!(v instanceof ProviderNumber)||! /^-?(0|[1-9]\d{0,14})$/.test(v.decimal))throw new Failure('INVALID_SOURCE');return BigInt(v.decimal);
}
const money=(c:bigint)=>`${c<0n?'-':''}${(c<0n?-c:c)/100n}.${((c<0n?-c:c)%100n).toString().padStart(2,'0')}`;
const cents=(v:unknown)=>{requireSource(typeof v==='string'&&/^\d{1,13}\.\d{2}$/.test(v));return BigInt((v as string).replace('.',''));};
const timestamp=(v:unknown)=>{const n=stripeInteger(v);requireSource(n>0n&&n<=253402300799n);return n.toString();};
function claimValue(raw:unknown):Claim{
 const v=providerObject(raw);requireSource(uuid(v.jobId)&&uuid(v.connectionId)&&uuid(v.leaseToken)&&['TEST','LIVE'].includes(String(v.environment))&&typeof v.mayDispatch==='boolean'&&typeof v.approvalDigest==='string'&&/^[a-f0-9]{32}$/.test(v.approvalDigest));
 sourceId(v.accountId,'acct');sourceId(v.invoiceId,'in');requireSource(cents(v.amount)>0n&&cents(v.amount)<=cents(v.receiptAmount));
 if(v.providerId!==null)sourceId(v.providerId,'re');if(v.recoveryId!==null)sourceId(v.recoveryId,'re');
 if(v.preflight!==null){const p=providerObject(v.preflight);requireSource(p.accountId===v.accountId&&p.environment===v.environment&&p.invoiceId===v.invoiceId&&p.receiptAmount===v.receiptAmount&&p.currency==='USD');sourceId(p.paymentId,'inpay');sourceId(p.paymentIntentId,'pi');sourceId(p.chargeId,'ch');}
 requireSource((v.preflight===null)===(v.dispatchStartedAt===null));return v as unknown as Claim;
}
async function digest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function authenticated(value:string,token:string){const [a,b]=await Promise.all([digest(value),digest(token)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function createProviderRefundWorker(deps:Dependencies){
 const transport=deps.fetch??fetch;
 return async(request:Request):Promise<Response>=>{
  const response=(status:number,value:Record<string,unknown>)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
  if(deps.token.length<32)return response(503,{error:'worker_not_configured'});
  const auth=request.headers.get('authorization')??'';
  if(auth.length>500||!auth.startsWith('Bearer ')||!await authenticated(auth.slice(7),deps.token))return response(401,{error:'unauthorized'});
  let jobId:string|null=null;
  try{const text=await limitedProviderBody(new Response(request.body));if(text.length>500)throw Error();const b=providerObject(JSON.parse(text));if(Object.keys(b).some(k=>k!=='jobId')||(b.jobId!==undefined&&!uuid(b.jobId)))throw Error();jobId=typeof b.jobId==='string'?b.jobId:null;}catch{return response(400,{error:'invalid_request'});}
  let claim:Claim|undefined,posting=false;
  try{
   const result=await deps.rpc('claim_provider_refund',{p_job:jobId});if(result===null)return response(200,{state:'idle'});claim=claimValue(result);const job=claim;
   const secret=deps.secrets[job.connectionId];
   if(!secret||secret.environment!==job.environment||secret.accountId!==job.accountId||typeof secret.secretKey!=='string'||!new RegExp('^(sk|rk)_'+(job.environment==='TEST'?'test':'live')+'_[A-Za-z0-9]{8,500}$').test(secret.secretKey))throw new Failure('CONFIGURATION');
   if(!job.mayDispatch&&job.dispatchStartedAt===null)throw new Failure('CONFIGURATION');
   const deadline=Date.now()+85000;
   const provider=async(path:string,params?:URLSearchParams)=>{
    if(Date.now()>=deadline)throw new Failure('PROVIDER_UNAVAILABLE');
    let r:Response;
    // Only fixed paths constructed from validated provider identifiers are used.
    requireSource(/^\/v1\/(account|invoices\/in_[A-Za-z0-9]+|invoice_payments\?invoice=in_[A-Za-z0-9]+&status=paid&limit=2|payment_intents\/pi_[A-Za-z0-9]+|charges\/ch_[A-Za-z0-9]+|refunds(?:\/re_[A-Za-z0-9]+|\?charge=ch_[A-Za-z0-9]+&limit=100(?:&starting_after=re_[A-Za-z0-9]+)?)?|balance_transactions\/txn_[A-Za-z0-9]+)$/.test(path));
    try{r=await transport('https://api.stripe.com'+path,{method:params?'POST':'GET',headers:{Authorization:'Bearer '+secret.secretKey,'Stripe-Version':STRIPE_REFUND_API_VERSION,...(params?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'tapaano-refund-'+job.jobId}:{})},...(params?{body:params.toString()}:{}),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});}catch{throw new Failure(params?'DISPATCH_UNCERTAIN':'PROVIDER_UNAVAILABLE');}
    if(!r.ok){await r.body?.cancel();throw new Failure(params?'DISPATCH_UNCERTAIN':r.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE');}
    let body:string,value:Record<string,unknown>;try{body=await limitedProviderBody(r);value=providerObject(parseProviderJson(body));}catch{throw new Failure(params?'DISPATCH_UNCERTAIN':'INVALID_SOURCE');}
    return {value,body};
   };
   const account=(await provider('/v1/account')).value;requireSource(account.id===job.accountId&&account.object==='account');
   let preflight=job.preflight;
   if(!preflight){
    const inv=(await provider('/v1/invoices/'+job.invoiceId)).value;requireSource(inv.object==='invoice'&&inv.id===job.invoiceId&&inv.currency==='usd'&&inv.livemode===(job.environment==='LIVE')&&inv.status==='paid'&&stripeInteger(inv.amount_paid)===cents(job.receiptAmount));
    const payments=(await provider('/v1/invoice_payments?invoice='+job.invoiceId+'&status=paid&limit=2')).value;
    requireSource(payments.object==='list'&&payments.has_more===false&&Array.isArray(payments.data)&&payments.data.length===1);
    const payment=providerObject((payments.data as unknown[])[0]),detail=providerObject(payment.payment);
    requireSource(payment.object==='invoice_payment'&&payment.invoice===job.invoiceId&&payment.status==='paid'&&payment.livemode===(job.environment==='LIVE')&&payment.currency==='usd'&&stripeInteger(payment.amount_paid)===cents(job.receiptAmount)&&detail.type==='payment_intent');
    const paymentId=sourceId(payment.id,'inpay'),paymentIntentId=sourceId(detail.payment_intent,'pi');
    const pi=(await provider('/v1/payment_intents/'+paymentIntentId)).value;
    requireSource(pi.object==='payment_intent'&&pi.id===paymentIntentId&&pi.status==='succeeded'&&pi.currency==='usd'&&pi.livemode===(job.environment==='LIVE')&&pi.customer===inv.customer&&stripeInteger(pi.amount_received)===cents(job.receiptAmount));
    const chargeId=sourceId(pi.latest_charge,'ch'),charge=(await provider('/v1/charges/'+chargeId)).value;
    requireSource(charge.object==='charge'&&charge.id===chargeId&&charge.payment_intent===paymentIntentId&&charge.customer===inv.customer&&charge.currency==='usd'&&charge.livemode===(job.environment==='LIVE')&&charge.paid===true&&charge.captured===true&&charge.status==='succeeded'&&charge.disputed===false&&stripeInteger(charge.amount_captured)===cents(job.receiptAmount)&&stripeInteger(charge.amount)===cents(job.receiptAmount)&&providerObject(charge.payment_method_details).type==='card');
    requireSource(['application','application_fee','application_fee_amount','on_behalf_of','source_transfer','transfer','transfer_data'].every(k=>charge[k]==null));
    preflight={invoiceId:job.invoiceId,paymentId,paymentIntentId,chargeId,receiptAmount:job.receiptAmount,currency:'USD',accountId:job.accountId,environment:job.environment};
   }
   const findExisting=async()=>{
    let cursor='',found:string|null=null;const seen=new Set<string>();
    for(let page=0;page<10;page++){
     const list=(await provider('/v1/refunds?charge='+preflight.chargeId+'&limit=100'+(cursor?'&starting_after='+cursor:''))).value;
     requireSource(list.object==='list'&&typeof list.has_more==='boolean'&&Array.isArray(list.data)&&list.data.length<=100);
     for(const item of list.data as unknown[]){const refund=providerObject(item),id=sourceId(refund.id,'re');requireSource(refund.charge===preflight.chargeId&&!seen.has(id));seen.add(id);const meta=refund.metadata==null?{}:providerObject(refund.metadata);if(meta.tapaano_refund_job===job.jobId){requireSource(found===null);found=id;}}
     if(!list.has_more)return found;
     requireSource((list.data as unknown[]).length>0);cursor=sourceId(providerObject((list.data as unknown[]).at(-1)).id,'re');
    }
    throw new Failure('RECOVERY_REQUIRED');
   };
   let existing=job.providerId??job.recoveryId??await findExisting();
   if(!existing){
    if(!job.mayDispatch)throw new Failure('CONFIGURATION');
    // Recheck remaining captured funds immediately before POST, including refunds
    // initiated outside this ERP. The provider enforces its final balance atomically.
    const charge=(await provider('/v1/charges/'+preflight.chargeId)).value;
    requireSource(charge.id===preflight.chargeId&&charge.currency==='usd'&&charge.livemode===(job.environment==='LIVE')&&charge.disputed===false&&charge.paid===true&&charge.captured===true&&stripeInteger(charge.amount_captured)===cents(job.receiptAmount)&&stripeInteger(charge.amount_refunded)>=0n&&stripeInteger(charge.amount_captured)-stripeInteger(charge.amount_refunded)>=cents(job.amount));
    const markArgs={p_job:job.jobId,p_lease:job.leaseToken,p_preflight:preflight};
    let marked:unknown;try{marked=await deps.rpc('mark_provider_refund_dispatch',markArgs);}catch{try{marked=await deps.rpc('mark_provider_refund_dispatch',markArgs);}catch{throw new Failure('DATABASE_UNAVAILABLE');}}
    const maySend=providerObject(marked).maySend;if(maySend!==true)throw new Failure('RECOVERY_REQUIRED');
    const params=new URLSearchParams({charge:preflight.chargeId,amount:cents(job.amount).toString(),reason:'requested_by_customer','metadata[tapaano_refund_job]':job.jobId,'metadata[tapaano_approval]':job.approvalDigest});
    posting=true;const created=await provider('/v1/refunds',params);existing=sourceId(created.value.id,'re');
   }else if(job.dispatchStartedAt===null){throw new Failure('INVALID_SOURCE');}
   // Always retrieve the canonical refund and both balance impacts before recording
   // success. POST alone is not sufficient evidence for an accounting entry.
   const refundResult=await provider('/v1/refunds/'+existing),refund=refundResult.value,metadata=providerObject(refund.metadata);
   requireSource(refund.object==='refund'&&refund.id===existing&&refund.charge===preflight.chargeId&&refund.payment_intent===preflight.paymentIntentId&&refund.currency==='usd'&&stripeInteger(refund.amount)===cents(job.amount)&&metadata.tapaano_refund_job===job.jobId&&metadata.tapaano_approval===job.approvalDigest&&['pending','requires_action','succeeded','failed','canceled'].includes(String(refund.status)));
   const bodies=[refundResult.body];
   const balance=async(raw:unknown,failure=false)=>{
    if(raw==null)return null;const id=sourceId(raw,'txn'),result=await provider('/v1/balance_transactions/'+id),b=result.value;bodies.push(result.body);
    requireSource(b.object==='balance_transaction'&&b.id===id&&b.source===existing&&b.currency==='usd'&&stripeInteger(b.amount)===(failure?cents(job.amount):-cents(job.amount))&&stripeInteger(b.fee)===0n&&stripeInteger(b.net)===stripeInteger(b.amount)&&b.exchange_rate==null&&(failure?['refund_failure','payment_failure_refund']:['refund','payment_refund']).includes(String(b.type)));
    return {id,source:existing,amount:money(stripeInteger(b.amount)),currency:'USD',type:b.type,created:timestamp(b.created)};
   };
   const originalBalance=await balance(refund.balance_transaction),failureBalance=await balance(refund.failure_balance_transaction,true);
   requireSource(refund.status!=='succeeded'||originalBalance!==null&&failureBalance===null);
   requireSource(!['failed','canceled'].includes(String(refund.status))||originalBalance===null||failureBalance!==null);
   const proof={id:existing,chargeId:preflight.chargeId,paymentIntentId:preflight.paymentIntentId,amount:job.amount,currency:'USD',status:refund.status,created:timestamp(refund.created),jobId:job.jobId,approvalDigest:job.approvalDigest,balance:originalBalance,failureBalance};
   const args={p_job:job.jobId,p_lease:job.leaseToken,p_proof:proof,p_body_sha256:await digest(JSON.stringify(bodies))};
   try{await deps.rpc('record_provider_refund_observation',args);}catch{try{await deps.rpc('record_provider_refund_observation',args);}catch{throw new Failure('DATABASE_UNAVAILABLE');}}
   return response(200,{state:'verified',status:refund.status});
  }catch(error){
   const code=error instanceof Failure?error.code:posting?'DISPATCH_UNCERTAIN':claim?'INVALID_SOURCE':'DATABASE_UNAVAILABLE';
   if(claim)try{await deps.rpc('release_provider_refund',{p_job:claim.jobId,p_lease:claim.leaseToken,p_error:code});}catch{/* Expired leases remain recoverable; never disclose provider payloads or keys. */}
   return response(503,{error:'provider_refund_incomplete',code});
  }
 };
}
