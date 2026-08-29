import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MaintainedEntity = Database["public"]["Tables"]["entities"]["Row"];

export interface EntityMasterEvent {
  id: string;
  entityId: string;
  actorId: string;
  eventType: "CREATE" | "RENAME";
  reason: string;
  oldName: string | null;
  newName: string;
  currency: string;
  occurredAt: string;
}

export function useEntityMaintenance() {
  const queryClient=useQueryClient();
  const {user,profile}=useAuth();
  const orgId=profile?.org_id;
  const isAdmin=profile?.role==="admin";
  const ready=Boolean(user?.id&&orgId&&isAdmin);

  const entitiesQuery=useQuery({
    queryKey:["entity-master-maintenance",user?.id,orgId],
    queryFn:async()=>{
      if(!orgId)return [];
      const {data,error}=await supabase.from("entities")
        .select("id,org_id,name,currency,created_at,updated_at")
        .eq("org_id",orgId).order("name");
      if(error)throw error;
      return data??[];
    },enabled:ready,
  });

  const eventsQuery=useQuery({
    queryKey:["entity-master-events",user?.id,orgId],
    queryFn:async()=>{
      const {data,error}=await supabase.rpc("list_tenant_entity_events");
      if(error)throw error;
      return(data??[]).map((event):EntityMasterEvent=>({
        id:event.event_id,entityId:event.entity_id,actorId:event.actor_id,
        eventType:event.event_type as EntityMasterEvent["eventType"],reason:event.reason,
        oldName:event.old_name,newName:event.new_name,currency:event.currency,
        occurredAt:event.occurred_at,
      }));
    },enabled:ready,
  });

  const invalidate=async()=>{
    await Promise.all([
      queryClient.invalidateQueries({queryKey:["entity-master-maintenance",user?.id,orgId]}),
      queryClient.invalidateQueries({queryKey:["entity-master-events",user?.id,orgId]}),
      queryClient.invalidateQueries({queryKey:["invoice-entities",user?.id,orgId]}),
      queryClient.invalidateQueries({queryKey:["supplier-bill-entities",user?.id,orgId]}),
    ]);
  };

  const createEntity=useMutation({
    mutationFn:async(input:{name:string;currency:string;reason:string;idempotencyKey:string})=>{
      const {data,error}=await supabase.rpc("create_tenant_entity",{
        p_name:input.name,p_currency:input.currency,p_reason:input.reason,
        p_idempotency_key:input.idempotencyKey,
      });
      if(error)throw error;return data;
    },onSuccess:invalidate,
  });

  const renameEntity=useMutation({
    mutationFn:async(input:{entityId:string;name:string;reason:string;idempotencyKey:string})=>{
      const {data,error}=await supabase.rpc("rename_tenant_entity",{
        p_entity_id:input.entityId,p_name:input.name,p_reason:input.reason,
        p_idempotency_key:input.idempotencyKey,
      });
      if(error)throw error;return data;
    },onSuccess:invalidate,
  });

  return{isAdmin,entities:entitiesQuery.data??[],entitiesLoading:entitiesQuery.isLoading,
    entitiesError:entitiesQuery.error,events:eventsQuery.data??[],eventsLoading:eventsQuery.isLoading,
    eventsError:eventsQuery.error,createEntity,renameEntity};
}
