import {createProviderRefundWorker,type ProviderRefundSecret} from '../_shared/providerRefundWorker.ts';

const url=Deno.env.get('SUPABASE_URL')??'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
let secrets:Record<string,ProviderRefundSecret>={};
try{const v=JSON.parse(Deno.env.get('PROVIDER_REFUND_CREDENTIALS')??'{}');if(v&&typeof v==='object'&&!Array.isArray(v))secrets=v;}catch{/* Configuration failure stays visible in the worker status. */}
async function rpc(name:string,args:Record<string,unknown>){
 if(!url||!key)throw new Error('service unavailable');
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('service request failed');return response.json();
}
Deno.serve(createProviderRefundWorker({token:Deno.env.get('PROVIDER_REFUND_WORKER_TOKEN')??'',secrets,rpc}));
