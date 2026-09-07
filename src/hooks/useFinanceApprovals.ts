import {useQuery} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {supabase} from '@/integrations/supabase/client';
import {readAllRows} from '@/lib/readAllRows';
import type {Json} from '@/integrations/supabase/types';

export async function financeResult<T>(response:PromiseLike<{data:T;error:unknown}>){const r=await response;if(r.error)throw r.error;return r.data;}
export const requestFinance=(entity:string,kind:string,payload:Json,reason:string,key:string)=>financeResult(supabase.rpc('request_finance_action',{p_entity_id:entity,p_kind:kind,p_payload:payload,p_reason:reason,p_key:key}));
export function useFinanceApprovals(){const {user,profile}=useAuth();return useQuery({queryKey:['finance-approvals',user?.id,profile?.org_id],enabled:Boolean(user&&profile?.org_id),queryFn:async()=>{
 const org=profile!.org_id!;
 const [requests,policies]=await Promise.all([
  readAllRows((from,to)=>supabase.from('finance_requests').select('*',{count:'exact'}).eq('org_id',org).order('requested_at',{ascending:false}).order('id').range(from,to)),
  readAllRows((from,to)=>supabase.from('finance_approval_policies').select('*',{count:'exact'}).eq('org_id',org).order('id').range(from,to)),
 ]);return {requests,policies};
}});}
