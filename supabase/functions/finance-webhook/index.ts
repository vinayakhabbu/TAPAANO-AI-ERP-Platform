import {createFinanceWebhook,type Connection,type SigningConfiguration} from '../_shared/financeWebhook.ts';

// Set server secrets through the deployment secret manager. Never accept credentials or tenant IDs in a request.
const url=Deno.env.get('SUPABASE_URL')??'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
let signing:Record<string,SigningConfiguration>={};
try{const parsed=JSON.parse(Deno.env.get('FINANCE_WEBHOOK_SIGNING')??'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))signing=parsed;}catch{ /* Fail closed until configuration is corrected. */ }
async function rpc(name:string,args:Record<string,unknown>){
 if(!url||!key)throw new Error('service unavailable');
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('service request failed');return response.json();
}
Deno.serve(createFinanceWebhook({signing,
 connection:id=>rpc('get_finance_connection',{p_connection:id}) as Promise<Connection|null>,
 enqueue:(id,event,hash)=>rpc('enqueue_finance_event',{p_connection:id,p_external_id:event.externalId,p_operation:event.operation,p_object_id:event.objectId,p_source:event.source,p_body_sha256:hash}) as Promise<string>,
}));
