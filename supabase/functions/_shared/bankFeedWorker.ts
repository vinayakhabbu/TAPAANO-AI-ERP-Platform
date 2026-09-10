import {limitedProviderBody,parseProviderJson,providerObject,providerUsd} from './providerJson.ts';

export type BankFeedSecret = {environment:'SANDBOX'|'PRODUCTION';itemId:string;accountId:string;clientId:string;secret:string;accessToken:string};
type Claim = {feedId:string;runId:string;leaseToken:string;environment:'SANDBOX'|'PRODUCTION';itemId:string;accountId:string;cursor:string|null;pageNumber:number};
type Dependencies = {
  token:string;secrets:Record<string,BankFeedSecret>;
  rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>;
  fetch?:typeof fetch;
};
class WorkerFailure extends Error { constructor(readonly code:string) { super(code); } }
const textField=(value:unknown,max:number)=>{if(typeof value!=='string'||value.length<1||value.length>max)throw new WorkerFailure('INVALID_SOURCE');return value;};
const list=(value:unknown)=>{if(!Array.isArray(value)||value.length>500)throw new WorkerFailure('INVALID_SOURCE');return value;};
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function claimValue(value:unknown):Claim {
  const v=providerObject(value);
  if(!uuid(v.feedId)||!uuid(v.runId)||!uuid(v.leaseToken)||!['SANDBOX','PRODUCTION'].includes(String(v.environment))||!Number.isSafeInteger(v.pageNumber)||Number(v.pageNumber)<0||Number(v.pageNumber)>=1000||!(v.cursor===null||typeof v.cursor==='string'&&v.cursor.length<=256))throw new WorkerFailure('DATABASE_UNAVAILABLE');
  textField(v.itemId,150);textField(v.accountId,150);
  return v as unknown as Claim;
}
export function normalizeBankFeedPage(value:unknown,accountId:string){
  const v=providerObject(value);
  if(typeof v.has_more!=='boolean'||!['NOT_READY','INITIAL_UPDATE_COMPLETE','HISTORICAL_UPDATE_COMPLETE','TRANSACTIONS_UPDATE_STATUS_UNKNOWN'].includes(String(v.transactions_update_status)))throw new WorkerFailure('INVALID_SOURCE');
  if(typeof v.next_cursor!=='string'||v.next_cursor.length>256||v.next_cursor==='now')throw new WorkerFailure('INVALID_SOURCE');
  if(v.next_cursor===''&&(v.has_more||v.transactions_update_status==='HISTORICAL_UPDATE_COMPLETE'||[v.added,v.modified,v.removed].some(rows=>list(rows).length)))throw new WorkerFailure('INVALID_SOURCE');
  const normalize=(raw:unknown,removed=false)=>{
    const t=providerObject(raw),externalId=textField(t.transaction_id,150);
    if(t.account_id!==accountId)throw new WorkerFailure('INVALID_SOURCE');
    if(removed)return {externalId,accountId,state:'REMOVED'};
    const date=textField(t.date,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||t.iso_currency_code!=='USD'||t.unofficial_currency_code!=null||typeof t.pending!=='boolean'||typeof t.name!=='string')throw new WorkerFailure('INVALID_SOURCE');
    const pendingId=t.pending_transaction_id==null?null:textField(t.pending_transaction_id,150);
    return {externalId,accountId,currency:'USD',date,description:t.name.slice(0,500),amount:providerUsd(t.amount,true),state:t.pending?'PENDING':'POSTED',pendingId};
  };
  return {requestId:textField(v.request_id,200),nextCursor:v.next_cursor,hasMore:v.has_more,updateStatus:v.transactions_update_status,
    added:list(v.added).map(t=>normalize(t)),modified:list(v.modified).map(t=>normalize(t)),removed:list(v.removed).map(t=>normalize(t,true))};
}
async function equalSecret(actual:string,expected:string){
  const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(actual)),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
  return new Uint8Array(a).every((byte,i)=>byte===new Uint8Array(b)[i]);
}
export function createBankFeedWorker(deps:Dependencies){
  const transport=deps.fetch??fetch;
  return async(request:Request):Promise<Response>=>{
    const respond=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    if(request.method!=='POST')return respond(405,{error:'method_not_allowed'});
    if(deps.token.length<32)return respond(503,{error:'worker_not_configured'});
    const authorization=request.headers.get('authorization')??'';
    if(authorization.length>500||!authorization.startsWith('Bearer ')||!await equalSecret(authorization.slice(7),deps.token))return respond(401,{error:'unauthorized'});
    let feed:string|null=null;
    try{
      const body=await limitedProviderBody(new Response(request.body));
      if(body.length>500)throw new Error('request too large');
      const v=providerObject(JSON.parse(body));
      if(Object.keys(v).some(k=>k!=='feedId')||(v.feedId!==undefined&&!uuid(v.feedId)))throw new Error('invalid request');
      feed=typeof v.feedId==='string'?v.feedId:null;
    }catch{return respond(400,{error:'invalid_request'});}
    let claim:Claim|undefined;
    try{
      const claimed=await deps.rpc('claim_bank_feed_sync',{p_feed:feed});
      if(claimed===null)return respond(200,{state:'idle'});
      claim=claimValue(claimed);
      const configuration=deps.secrets[claim.feedId];
      if(!configuration||configuration.environment!==claim.environment||configuration.itemId!==claim.itemId||configuration.accountId!==claim.accountId||![configuration.clientId,configuration.secret,configuration.accessToken].every(v=>typeof v==='string'&&v.length>=8&&v.length<=1000))throw new WorkerFailure('CONFIGURATION');
      // Provider origin and paths cannot be supplied by callers or credential metadata.
      const origin=claim.environment==='SANDBOX'?'https://sandbox.plaid.com':'https://production.plaid.com';
      const provider=async(path:'/item/get'|'/accounts/get'|'/transactions/sync',args:Record<string,unknown>={})=>{
        let response:Response;
        try{response=await transport(origin+path,{method:'POST',headers:{'Content-Type':'application/json','Plaid-Version':'2020-09-14'},body:JSON.stringify({client_id:configuration.clientId,secret:configuration.secret,access_token:configuration.accessToken,...args}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new WorkerFailure('PROVIDER_UNAVAILABLE');}
        let body:string;let value:Record<string,unknown>;
        try{body=await limitedProviderBody(response);value=providerObject(parseProviderJson(body));}catch{throw new WorkerFailure('INVALID_SOURCE');}
        if(!response.ok){
          const code=value.error_code;
          if(code==='TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION')throw new WorkerFailure('CURSOR_MUTATION');
          if(response.status===429)throw new WorkerFailure('RATE_LIMITED');
          if(['ITEM_LOGIN_REQUIRED','INVALID_ACCESS_TOKEN','INVALID_API_KEYS','ITEM_LOCKED','USER_PERMISSION_REVOKED'].includes(String(code)))throw new WorkerFailure('AUTH_REQUIRED');
          throw new WorkerFailure('PROVIDER_UNAVAILABLE');
        }
        return {value,body};
      };
      const item=providerObject((await provider('/item/get')).value.item);
      if(item.item_id!==claim.itemId||item.error!=null)throw new WorkerFailure('AUTH_REQUIRED');
      const accounts=(await provider('/accounts/get')).value;
      const matched=list(accounts.accounts).filter(raw=>providerObject(raw).account_id===claim!.accountId);
      if(matched.length!==1)throw new WorkerFailure('CONFIGURATION');
      const account=providerObject(matched[0]),balances=providerObject(account.balances);
      if(account.type!=='depository'||balances.iso_currency_code!=='USD'||balances.unofficial_currency_code!=null)throw new WorkerFailure('CONFIGURATION');
      for(let pages=0;pages<3;pages++){
        const {value,body}=await provider('/transactions/sync',{...(claim.cursor===null?{}:{cursor:claim.cursor}),count:500,options:{account_id:claim.accountId,days_requested:730}});
        let page:ReturnType<typeof normalizeBankFeedPage>;
        try{page=normalizeBankFeedPage(value,claim.accountId);}catch{throw new WorkerFailure('INVALID_SOURCE');}
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))).map(n=>n.toString(16).padStart(2,'0')).join('');
        const args={p_run:claim.runId,p_token:claim.leaseToken,p_number:claim.pageNumber,p_cursor:claim.cursor,p_page:page,p_body_sha256:hash};
        let result:Record<string,unknown>;
        // A lost persistence response retries the exact page before any next provider request.
        try{result=providerObject(await deps.rpc('append_bank_feed_page',args));}catch{
          try{result=providerObject(await deps.rpc('append_bank_feed_page',args));}catch{throw new WorkerFailure('DATABASE_UNAVAILABLE');}
        }
        if(result.committed===true)return respond(200,{state:page.updateStatus==='HISTORICAL_UPDATE_COMPLETE'?'synchronized':'waiting_for_bank',feedId:claim.feedId});
        if(page.hasMore!==true||result.nextCursor!==page.nextCursor||result.pageNumber!==claim.pageNumber+1)throw new WorkerFailure('DATABASE_UNAVAILABLE');
        claim={...claim,cursor:page.nextCursor,pageNumber:claim.pageNumber+1};
      }
      await deps.rpc('release_bank_feed_sync',{p_run:claim.runId,p_token:claim.leaseToken,p_error:null});
      return respond(200,{state:'continuation_queued',feedId:claim.feedId});
    }catch(error){
      const code=error instanceof WorkerFailure?error.code:'DATABASE_UNAVAILABLE';
      if(claim)try{await deps.rpc('release_bank_feed_sync',{p_run:claim.runId,p_token:claim.leaseToken,p_error:code});}catch{/* An expired lease restarts from the last committed cursor. */}
      return respond(503,{error:'bank_sync_incomplete',code});
    }
  };
}
