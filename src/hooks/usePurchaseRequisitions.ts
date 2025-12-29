import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace, type DecisionType, type PrecedentReference } from "@/hooks/useDecisionLedger";
import { evaluateRequisitionPolicy } from "@/lib/policyRules";

export interface PurchaseRequisition {
  id: string;
  requisition_number: string;
  org_id: string;
  entity_id: string;
  requester_id: string | null;
  department: string | null;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "converted" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  required_date: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  purchase_order_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequisitionLine {
  id: string;
  requisition_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_of_measure: string;
  estimated_unit_cost: number;
  estimated_total: number;
  suggested_vendor_id: string | null;
  notes: string | null;
  created_at: string;
  product?: { name: string; sku: string } | null;
  suggested_vendor?: { name: string } | null;
}

export const usePurchaseRequisitions = () => {
  return useQuery({
    queryKey: ["purchase_requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_requisitions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PurchaseRequisition[];
    },
  });
};

export const usePurchaseRequisitionLines = (requisitionId: string | null) => {
  return useQuery({
    queryKey: ["purchase_requisition_lines", requisitionId],
    queryFn: async () => {
      if (!requisitionId) return [];
      
      const { data, error } = await supabase
        .from("purchase_requisition_lines")
        .select(`
          *,
          product:products(name, sku),
          suggested_vendor:vendors(name)
        `)
        .eq("requisition_id", requisitionId)
        .order("created_at");

      if (error) throw error;
      return data as PurchaseRequisitionLine[];
    },
    enabled: !!requisitionId,
  });
};

interface CreateRequisitionData {
  org_id: string;
  entity_id: string;
  department?: string;
  priority?: string;
  required_date?: string;
  notes?: string;
  lines: {
    product_id?: string;
    description: string;
    quantity: number;
    unit_of_measure?: string;
    estimated_unit_cost: number;
    suggested_vendor_id?: string;
    notes?: string;
  }[];
}

export const useCreatePurchaseRequisition = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRequisitionData) => {
      // Generate requisition number
      const requisitionNumber = `PR-${Date.now().toString(36).toUpperCase()}`;

      // Insert requisition header
      const { data: requisition, error: reqError } = await supabase
        .from("purchase_requisitions")
        .insert({
          org_id: data.org_id,
          entity_id: data.entity_id,
          requisition_number: requisitionNumber,
          department: data.department,
          priority: data.priority || "normal",
          required_date: data.required_date,
          notes: data.notes,
        })
        .select()
        .single();

      if (reqError) throw reqError;

      // Insert requisition lines
      if (data.lines.length > 0) {
        const lines = data.lines.map((line) => ({
          requisition_id: requisition.id,
          product_id: line.product_id || null,
          description: line.description,
          quantity: line.quantity,
          unit_of_measure: line.unit_of_measure || "EA",
          estimated_unit_cost: line.estimated_unit_cost,
          suggested_vendor_id: line.suggested_vendor_id || null,
          notes: line.notes,
        }));

        const { error: linesError } = await supabase
          .from("purchase_requisition_lines")
          .insert(lines);

        if (linesError) throw linesError;
      }

      return requisition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
      toast({
        title: "Requisition Created",
        description: "Purchase requisition has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

interface ApprovalAction {
  id: string;
  action: "submit" | "approve" | "reject";
  rejection_reason?: string;
  rationale?: string;
}

export const usePurchaseRequisitionApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, rejection_reason, rationale }: ApprovalAction) => {
      // Fetch current requisition state for decision trace
      const { data: currentReq } = await supabase
        .from("purchase_requisitions")
        .select("*")
        .eq("id", id)
        .single();

      // Also get lines for total calculation
      const { data: lines } = await supabase
        .from("purchase_requisition_lines")
        .select("*")
        .eq("requisition_id", id);

      const estimatedTotal = lines?.reduce((sum, line) => sum + (line.quantity * line.estimated_unit_cost), 0) || 0;

      let updateData: Partial<PurchaseRequisition> = {};
      let newStatus: string;
      let decisionType: DecisionType;

      switch (action) {
        case "submit":
          updateData = { status: "pending_approval" };
          newStatus = "pending_approval";
          decisionType = "requisition_approval";
          break;
        case "approve":
          updateData = {
            status: "approved",
            approved_at: new Date().toISOString(),
          };
          newStatus = "approved";
          decisionType = "requisition_approval";
          break;
        case "reject":
          updateData = {
            status: "rejected",
            rejected_at: new Date().toISOString(),
            rejection_reason,
          };
          newStatus = "rejected";
          decisionType = "requisition_rejection";
          break;
        default:
          throw new Error("Invalid action");
      }

      const { data, error } = await supabase
        .from("purchase_requisitions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Capture decision trace with policy evaluation
      if (currentReq) {
        // Evaluate policies
        const policyEvaluation = evaluateRequisitionPolicy(
          estimatedTotal,
          currentReq.priority,
          currentReq.department || undefined
        );

        // Find precedents
        const { data: precedentData } = await supabase
          .from("decision_traces")
          .select("id, input_snapshot, rationale_text")
          .eq("org_id", currentReq.org_id)
          .eq("decision_type", decisionType)
          .eq("source_type", "purchase_requisition")
          .in("approval_status", ["approved", "rejected"])
          .order("created_at", { ascending: false })
          .limit(3);

        const precedentsReferenced: PrecedentReference[] = (precedentData || []).map((p, idx) => ({
          decision_id: p.id,
          similarity: Math.round((0.9 - idx * 0.15) * 100) / 100,
          note: p.rationale_text?.slice(0, 50) || undefined,
        }));

        await captureDecisionTrace(currentReq.org_id, {
          decision_type: decisionType,
          source_type: "purchase_requisition",
          source_id: id,
          approval_status: action === "submit" ? "pending" : action === "approve" ? "approved" : "rejected",
          input_snapshot: {
            requisition_number: currentReq.requisition_number,
            department: currentReq.department,
            priority: currentReq.priority,
            estimated_total: estimatedTotal,
            line_count: lines?.length || 0,
            previous_status: currentReq.status,
          },
          policy_evaluation: policyEvaluation,
          precedents_referenced: precedentsReferenced,
          commit_writes: [{
            entity: "purchase_requisition",
            id,
            field: "status",
            before: currentReq.status,
            after: newStatus,
          }],
          rationale_text: rationale || rejection_reason,
          entities: [
            { entity_type: "purchase_requisition", entity_id: id, entity_label: currentReq.requisition_number },
          ],
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
      const actionText = variables.action === "submit" ? "submitted for approval" : variables.action === "approve" ? "approved" : "rejected";
      toast({
        title: "Requisition Updated",
        description: `Requisition has been ${actionText}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

interface ConvertToPOData {
  requisitionId: string;
  vendorId: string;
  entityId: string;
  orgId: string;
  expectedDeliveryDate?: string;
  notes?: string;
}

export const useConvertRequisitionToPO = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ requisitionId, vendorId, entityId, orgId, expectedDeliveryDate, notes }: ConvertToPOData) => {
      // Get requisition lines
      const { data: lines, error: linesError } = await supabase
        .from("purchase_requisition_lines")
        .select("*")
        .eq("requisition_id", requisitionId);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) throw new Error("No lines to convert");

      // Calculate totals
      const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.estimated_unit_cost), 0);
      const tax = subtotal * 0.1; // 10% tax
      const total = subtotal + tax;

      // Generate PO number
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

      // Create PO
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({
          org_id: orgId,
          entity_id: entityId,
          vendor_id: vendorId,
          po_number: poNumber,
          expected_delivery_date: expectedDeliveryDate,
          notes,
          subtotal,
          tax,
          total,
          status: "draft",
        })
        .select()
        .single();

      if (poError) throw poError;

      // Create PO lines
      const poLines = lines.map((line) => ({
        purchase_order_id: po.id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.estimated_unit_cost,
        total: line.quantity * line.estimated_unit_cost,
      }));

      const { error: poLinesError } = await supabase
        .from("purchase_order_lines")
        .insert(poLines);

      if (poLinesError) throw poLinesError;

      // Update requisition status
      const { error: updateError } = await supabase
        .from("purchase_requisitions")
        .update({
          status: "converted",
          purchase_order_id: po.id,
          converted_at: new Date().toISOString(),
        })
        .eq("id", requisitionId);

      if (updateError) throw updateError;

      return po;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      toast({
        title: "Requisition Converted",
        description: "Purchase requisition has been converted to a PO.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
