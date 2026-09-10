import {pathToFileURL} from 'node:url';

const states=new Set(['idle','synchronized','waiting_for_bank','continuation_queued']);
const errors=new Set(['AUTH_REQUIRED','PROVIDER_UNAVAILABLE','RATE_LIMITED','CURSOR_MUTATION','INVALID_SOURCE','CONFIGURATION','INTERRUPTED','DATABASE_UNAVAILABLE']);
export async function runBankFeedScheduler({url,token},transport=fetch){
 let endpoint;try{endpoint=new URL(url);}catch{throw new Error('Configure the bank feed worker URL.');}
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.supabase.co')||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/functions/v1/bank-feed-worker'||typeof token!=='string'||token.length<32||token.length>400)throw new Error('Invalid bank feed scheduler configuration.');
 const results=[];
 for(let i=0;i<3;i++){
  let response;try{response=await transport(endpoint.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(120000)});}catch{throw new Error('Bank feed worker could not be reached.');}
  let body;try{
   const reader=response.body.getReader(),chunks=[];let size=0;
   for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new Error('large response');}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));
  }catch{throw new Error('Bank feed worker returned an invalid response.');}
  if(!response.ok)throw new Error('Bank feed worker requires attention'+(errors.has(body?.code)?': '+body.code:'.'));
  if(!states.has(body?.state))throw new Error('Bank feed worker returned an unrecognized status.');
  results.push(body.state);if(body.state==='idle')break;
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const states=await runBankFeedScheduler({url:process.env.BANK_FEED_WORKER_URL,token:process.env.BANK_FEED_WORKER_TOKEN});console.log('Bank feed worker: '+states.join(', '));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
