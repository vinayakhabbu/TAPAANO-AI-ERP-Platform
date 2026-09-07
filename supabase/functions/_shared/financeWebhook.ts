// Raw-body verification precedes all database access. This module also runs in the acceptance tests.
export type Connection = {id:string;provider:'STRIPE'|'GENERIC';account:string;environment:'TEST'|'LIVE';currency:string;timezone:string;enabled:boolean};
export type SigningConfiguration = {provider:'STRIPE'|'GENERIC';account:string;environment:'TEST'|'LIVE';secrets:string[]};
type Source = Record<string,unknown>;
export type FinanceEvent = {externalId:string;operation:'RECEIPT'|'PAYOUT'|'USAGE'|'JOURNAL'|'UNSUPPORTED';objectId:string;source:Source};
type Dependencies = {signing:Record<string,SigningConfiguration>;connection:(id:string)=>Promise<Connection|null>;enqueue:(id:string,event:FinanceEvent,hash:string)=>Promise<string>;now?:()=>number};
const utf8=new TextEncoder();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(value:unknown,max=200):string=>{if(typeof value!=='string'||!value.length||value.length>max)throw new Error('invalid string');return value;};
const object=(value:unknown):Source=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid object');return value as Source;};
const exact=(value:unknown):string=>{const s=text(value,20);if(!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(s)||!/[1-9]/.test(s))throw new Error('invalid amount');return s;};
function date(value:unknown):string{const s=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('invalid date');return s;}
function minor(value:unknown):string{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0||value>999999999999999)throw new Error('invalid minor amount');const n=BigInt(value);return String(n/100n)+'.'+String(n%100n).padStart(2,'0');}
function accountingDate(value:unknown,timezone:string):string{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('invalid source timestamp');const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value*1000));return date(['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-'));}
const allowed=(value:Source,keys:string[])=>{if(Object.keys(value).some(k=>!keys.includes(k)))throw new Error('unknown event field');};

export function normalizeFinanceEvent(body:unknown,connection:Connection):FinanceEvent{
 const event=object(body),externalId=text(event.id),kind=text(event.type,150);
 if(connection.provider==='STRIPE'){
  if(typeof event.livemode!=='boolean'||event.livemode!==(connection.environment==='LIVE')||(event.account!==undefined&&event.account!==connection.account))throw new Error('provider account or environment mismatch');
  if(!['invoice.paid','payout.paid'].includes(kind))return {externalId,operation:'UNSUPPORTED',objectId:externalId,source:{type:kind}};
  const source=object(object(event.data).object),objectId=text(source.id);
  if(source.currency!=='usd'||connection.currency!=='USD')throw new Error('unsupported currency');
  if(kind==='invoice.paid'){
   if(source.status!=='paid'||source.paid_out_of_band===true)throw new Error('receipt requires processor settlement evidence');
   const transitions=object(source.status_transitions);
   return {externalId,operation:'RECEIPT',objectId,source:{currency:'USD',date:accountingDate(transitions.paid_at,connection.timezone),amount:minor(source.amount_paid),type:kind}};
  }
  if(source.status!=='paid')throw new Error('payout is not paid');
  // arrival_date represents the provider's expected banking calendar date, encoded as a UTC timestamp.
  return {externalId,operation:'PAYOUT',objectId,source:{currency:'USD',date:accountingDate(source.arrival_date,'UTC'),amount:minor(source.amount),type:kind}};
 }
 allowed(event,['version','id','type','account','environment','object_id','data']);
 if(event.version!==1||event.account!==connection.account||event.environment!==connection.environment)throw new Error('provider account, environment or protocol mismatch');
 const source=object(event.data),objectId=text(event.object_id);
 if(kind==='usage.recorded'){
  allowed(source,['units','occurred_at']);const units=text(source.units,24),occurred=text(source.occurred_at,40);
  if(!/^[0-9]{1,15}(\.[0-9]{1,6})?$/.test(units)||!/[1-9]/.test(units)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(occurred)||!Number.isFinite(Date.parse(occurred)))throw new Error('invalid usage or timestamp');
  return {externalId,operation:'USAGE',objectId,source:{units,occurred_at:occurred,type:kind}};
 }
 if(['customer.receipt','processor.payout','journal.posted'].includes(kind)){
  allowed(source,kind==='journal.posted'?['currency','date','lines']:['currency','date','amount']);
  if(source.currency!=='USD'||connection.currency!=='USD')throw new Error('unsupported currency');
  const result:Source={currency:'USD',date:date(source.date),type:kind};
  if(kind==='journal.posted'){
   if(!Array.isArray(source.lines)||source.lines.length<2||source.lines.length>500)throw new Error('invalid source journal');
   result.lines=source.lines.map(item=>{const line=object(item);allowed(line,['account_code','debit','credit','memo']);const debit=text(line.debit,20),credit=text(line.credit,20);if(!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(debit)||!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(credit))throw new Error('invalid journal amount');return {account_code:text(line.account_code,50),debit,credit,memo:line.memo===undefined?'Imported journal':text(line.memo,240)};});
  }else result.amount=exact(source.amount);
  return {externalId,operation:kind==='journal.posted'?'JOURNAL':kind==='customer.receipt'?'RECEIPT':'PAYOUT',objectId,source:result};
 }
 return {externalId,operation:'UNSUPPORTED',objectId:externalId,source:{type:kind}};
}

async function limitedBody(request:Request):Promise<Uint8Array>{
 const limit=1048576;if(Number(request.headers.get('content-length')??0)>limit)throw new Error('body too large');
 const reader=request.body?.getReader();if(!reader)throw new Error('missing body');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw new Error('body too large');}chunks.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function createFinanceWebhook(dependencies:Dependencies){return async(request:Request):Promise<Response>=>{
 const reply=(status:number,code:string)=>Response.json({code},{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply(405,'post_required');
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,'json_required');
 const params=new URL(request.url).searchParams,id=params.get('connection')??'';
 if(!uuid.test(id)||params.getAll('connection').length!==1)return reply(400,'invalid_connection');
 const signing=Object.hasOwn(dependencies.signing,id)?dependencies.signing[id]:undefined;
 if(!signing||!Array.isArray(signing.secrets)||signing.secrets.length<1||signing.secrets.length>3||signing.secrets.some(s=>typeof s!=='string'||s.length<32))return reply(503,'connection_not_configured');
 const header=request.headers.get(signing.provider==='STRIPE'?'stripe-signature':'x-finance-signature');
 if(!header||header.length>4096)return reply(401,'signature_required');
 const fields=header.split(',').map(s=>s.trim().split('=')),times=fields.filter(p=>p[0]==='t'),signatures=fields.filter(p=>p[0]==='v1'&&/^[0-9a-f]{64}$/.test(p[1]??''));
 if(times.length!==1||!/^\d{1,12}$/.test(times[0][1]??'')||!signatures.length||signatures.length>8)return reply(401,'invalid_signature');
 const timestamp=times[0][1],now=Math.floor((dependencies.now?.()??Date.now())/1000);
 if(Math.abs(now-Number(timestamp))>300)return reply(401,'expired_signature');
 let bytes:Uint8Array;try{bytes=await limitedBody(request);}catch{return reply(413,'invalid_body_size');}
 const prefix=utf8.encode(timestamp+'.'),signed=new Uint8Array(prefix.length+bytes.length);signed.set(prefix);signed.set(bytes,prefix.length);
 let verified=false;
 for(const secret of signing.secrets){const key=await crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);for(const signature of signatures){const binary=Uint8Array.from(signature[1].match(/../g)!,h=>parseInt(h,16));if(await crypto.subtle.verify('HMAC',key,binary,signed))verified=true;}}
 if(!verified)return reply(401,'invalid_signature');
 let connection:Connection|null;
 try{connection=await dependencies.connection(id);}catch{return reply(503,'connection_unavailable');}
 if(!connection?.enabled||connection.id!==id||connection.provider!==signing.provider||connection.account!==signing.account||connection.environment!==signing.environment)return reply(503,'connection_unavailable');
 let event:FinanceEvent;
 try{event=normalizeFinanceEvent(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),connection);}catch{return reply(422,'invalid_provider_event');}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 try{await dependencies.enqueue(id,event,hash);}catch{return reply(503,'event_not_persisted');}
 return reply(200,'received_for_review');
};}
