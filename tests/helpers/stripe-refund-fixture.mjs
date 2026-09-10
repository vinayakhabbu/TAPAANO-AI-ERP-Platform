import assert from 'node:assert/strict';
/** Substitute provider transport only. Never use this fixture against a real provider. */
export function stripeRefundFixture({accountId='acct_acceptance',invoiceId='in_acceptance',receiptCents=10000,refundCents=2000}={}){
 const state={status:'succeeded',refund:null,posts:[],calls:[],losePost:false,created:Math.floor(Date.now()/1000),chargeId:'ch_acceptance',paymentIntentId:'pi_acceptance',invalidCharge:false,fee:0,multiplePayments:false};
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 const refund=()=>({...state.refund,status:state.status,balance_transaction:state.status==='pending'?null:'txn_refund',failure_balance_transaction:['failed','canceled'].includes(state.status)?'txn_return':null});
 const fetch=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://api.stripe.com');assert.equal(init.redirect,'error');assert.equal(init.headers['Stripe-Version'],'2026-08-26.dahlia');state.calls.push({url,method:init.method});const u=new URL(url);
  if(u.pathname==='/v1/account')return json({object:'account',id:accountId});
  if(u.pathname==='/v1/invoices/'+invoiceId)return json({object:'invoice',id:invoiceId,currency:'usd',livemode:false,status:'paid',amount_paid:receiptCents,customer:'cus_acceptance'});
  if(u.pathname==='/v1/invoice_payments'){assert.equal(u.searchParams.get('invoice'),invoiceId);assert.equal(u.searchParams.get('status'),'paid');const payment={id:'inpay_acceptance',object:'invoice_payment',invoice:invoiceId,status:'paid',livemode:false,currency:'usd',amount_paid:receiptCents,payment:{type:'payment_intent',payment_intent:state.paymentIntentId}};return json({object:'list',has_more:false,data:state.multiplePayments?[payment,{...payment,id:'inpay_second'}]:[payment]});}
  if(u.pathname==='/v1/payment_intents/'+state.paymentIntentId)return json({object:'payment_intent',id:state.paymentIntentId,status:'succeeded',currency:'usd',livemode:false,customer:'cus_acceptance',amount_received:receiptCents,latest_charge:state.chargeId});
  if(u.pathname==='/v1/charges/'+state.chargeId)return json({object:'charge',id:state.chargeId,payment_intent:state.paymentIntentId,customer:'cus_acceptance',currency:'usd',livemode:false,paid:true,captured:true,status:'succeeded',disputed:state.invalidCharge,amount_captured:receiptCents,amount:receiptCents,amount_refunded:state.refund?refundCents:0,payment_method_details:{type:'card'}});
  if(u.pathname==='/v1/refunds'&&init.method==='POST'){
   const p=new URLSearchParams(init.body);assert.equal(p.get('charge'),state.chargeId);assert.equal(p.get('amount'),String(refundCents));assert.match(init.headers['Idempotency-Key'],/^tapaano-refund-/);
   state.posts.push({body:init.body,key:init.headers['Idempotency-Key']});
   if(!state.refund)state.refund={object:'refund',id:'re_acceptance',charge:state.chargeId,payment_intent:state.paymentIntentId,amount:refundCents,currency:'usd',created:state.created,metadata:{tapaano_refund_job:p.get('metadata[tapaano_refund_job]'),tapaano_approval:p.get('metadata[tapaano_approval]')}};
   if(state.losePost){state.losePost=false;throw new Error('Synthetic lost provider POST response');}return json(refund());
  }
  if(u.pathname==='/v1/refunds'){assert.equal(u.searchParams.get('charge'),state.chargeId);return json({object:'list',has_more:false,data:state.refund?[refund()]:[]});}
  if(u.pathname==='/v1/refunds/re_acceptance')return json(refund());
  if(u.pathname.startsWith('/v1/balance_transactions/')){const failure=u.pathname.endsWith('txn_return'),amount=failure?refundCents:-refundCents;return json({object:'balance_transaction',id:failure?'txn_return':'txn_refund',source:'re_acceptance',amount,currency:'usd',fee:state.fee,net:amount-state.fee,exchange_rate:null,type:failure?'refund_failure':'refund',created:state.created});}
  throw new Error('Unexpected synthetic Stripe endpoint '+u.pathname);
 };
 return {state,fetch};
}
