import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;
}

// ============================================================================
// AUTH HELPER - Validates user and extracts verified org_id
// ============================================================================

async function validateAuthAndGetOrgId(req: Request): Promise<{ user: any; org_id: string; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, org_id: '', error: 'Missing or invalid authorization header' };
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  // Verify user token
  const token = authHeader.replace('Bearer ', '');
  const { data, error: authError } = await supabaseClient.auth.getUser(token);
  
  if (authError || !data?.user) {
    return { user: null, org_id: '', error: 'Invalid or expired token' };
  }

  // Get user's org_id from their profile (don't trust client input!)
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('org_id')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return { user: data.user, org_id: '', error: 'User profile not found or not associated with an organization' };
  }

  return { user: data.user, org_id: profile.org_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication and get verified org_id
    const { user, org_id, error: authError } = await validateAuthAndGetOrgId(req);
    
    if (authError || !org_id) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query } = await req.json();
    
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Global search request - query:", query, "org_id:", org_id, "user:", user.id);

    const searchPattern = `%${query}%`;
    const results: SearchResult[] = [];

    // Search Customers (scoped to org)
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("org_id", org_id)
      .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(5);

    if (customers) {
      results.push(...customers.map(c => ({
        id: c.id,
        type: "Customer",
        title: c.name,
        subtitle: c.email || undefined,
        href: "/crm",
        icon: "Users",
      })));
    }

    // Search Vendors (scoped to org)
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, name, email")
      .eq("org_id", org_id)
      .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(5);

    if (vendors) {
      results.push(...vendors.map(v => ({
        id: v.id,
        type: "Vendor",
        title: v.name,
        subtitle: v.email || undefined,
        href: "/ap",
        icon: "Building",
      })));
    }

    // Search Products (scoped to org)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku")
      .eq("org_id", org_id)
      .or(`name.ilike.${searchPattern},sku.ilike.${searchPattern}`)
      .limit(5);

    if (products) {
      results.push(...products.map(p => ({
        id: p.id,
        type: "Product",
        title: p.name,
        subtitle: p.sku || undefined,
        href: "/inventory",
        icon: "Package",
      })));
    }

    // Search Invoices (scoped to org)
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, status")
      .eq("org_id", org_id)
      .ilike("invoice_number", searchPattern)
      .limit(5);

    if (invoices) {
      results.push(...invoices.map(i => ({
        id: i.id,
        type: "Invoice",
        title: i.invoice_number,
        subtitle: `$${i.total?.toLocaleString() ?? 0} • ${i.status}`,
        href: "/ar",
        icon: "FileText",
      })));
    }

    // Search Bills (scoped to org)
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, total, status")
      .eq("org_id", org_id)
      .ilike("bill_number", searchPattern)
      .limit(5);

    if (bills) {
      results.push(...bills.map(b => ({
        id: b.id,
        type: "Bill",
        title: b.bill_number,
        subtitle: `$${b.total?.toLocaleString() ?? 0} • ${b.status}`,
        href: "/ap",
        icon: "Receipt",
      })));
    }

    // Search Sales Orders (scoped to org)
    const { data: salesOrders } = await supabase
      .from("sales_orders")
      .select("id, so_number, total, status")
      .eq("org_id", org_id)
      .ilike("so_number", searchPattern)
      .limit(5);

    if (salesOrders) {
      results.push(...salesOrders.map(so => ({
        id: so.id,
        type: "Sales Order",
        title: so.so_number,
        subtitle: `$${so.total?.toLocaleString() ?? 0} • ${so.status}`,
        href: "/ar",
        icon: "ShoppingCart",
      })));
    }

    // Search Purchase Orders (scoped to org)
    const { data: purchaseOrders } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total, status")
      .eq("org_id", org_id)
      .ilike("po_number", searchPattern)
      .limit(5);

    if (purchaseOrders) {
      results.push(...purchaseOrders.map(po => ({
        id: po.id,
        type: "Purchase Order",
        title: po.po_number,
        subtitle: `$${po.total?.toLocaleString() ?? 0} • ${po.status}`,
        href: "/ap",
        icon: "ClipboardList",
      })));
    }

    // Search Opportunities (scoped to org)
    const { data: opportunities } = await supabase
      .from("opportunities")
      .select("id, name, value, stage")
      .eq("org_id", org_id)
      .ilike("name", searchPattern)
      .limit(5);

    if (opportunities) {
      results.push(...opportunities.map(o => ({
        id: o.id,
        type: "Opportunity",
        title: o.name,
        subtitle: `$${o.value?.toLocaleString() ?? 0} • ${o.stage}`,
        href: "/crm",
        icon: "Target",
      })));
    }

    // Search Quotations (scoped to org)
    const { data: quotations } = await supabase
      .from("quotations")
      .select("id, quotation_number, total, status")
      .eq("org_id", org_id)
      .ilike("quotation_number", searchPattern)
      .limit(5);

    if (quotations) {
      results.push(...quotations.map(q => ({
        id: q.id,
        type: "Quotation",
        title: q.quotation_number,
        subtitle: `$${q.total?.toLocaleString() ?? 0} • ${q.status}`,
        href: "/ar",
        icon: "FileCheck",
      })));
    }

    // Search Production Orders (scoped to org)
    const { data: productionOrders } = await supabase
      .from("production_orders")
      .select("id, order_number, status")
      .eq("org_id", org_id)
      .ilike("order_number", searchPattern)
      .limit(5);

    if (productionOrders) {
      results.push(...productionOrders.map(po => ({
        id: po.id,
        type: "Production Order",
        title: po.order_number,
        subtitle: po.status,
        href: "/production",
        icon: "Factory",
      })));
    }

    // Search Service Calls (scoped to org)
    const { data: serviceCalls } = await supabase
      .from("service_calls")
      .select("id, call_number, subject, status")
      .eq("org_id", org_id)
      .or(`call_number.ilike.${searchPattern},subject.ilike.${searchPattern}`)
      .limit(5);

    if (serviceCalls) {
      results.push(...serviceCalls.map(sc => ({
        id: sc.id,
        type: "Service Call",
        title: sc.call_number,
        subtitle: sc.subject || sc.status,
        href: "/service",
        icon: "Wrench",
      })));
    }

    // Search Accounts (scoped to org)
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, code, name")
      .eq("org_id", org_id)
      .or(`code.ilike.${searchPattern},name.ilike.${searchPattern}`)
      .limit(5);

    if (accounts) {
      results.push(...accounts.map(a => ({
        id: a.id,
        type: "Account",
        title: `${a.code} - ${a.name}`,
        href: "/gl",
        icon: "BookOpen",
      })));
    }

    // Search Warehouses (scoped to org)
    const { data: warehouses } = await supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("org_id", org_id)
      .or(`code.ilike.${searchPattern},name.ilike.${searchPattern}`)
      .limit(5);

    if (warehouses) {
      results.push(...warehouses.map(w => ({
        id: w.id,
        type: "Warehouse",
        title: `${w.code} - ${w.name}`,
        href: "/inventory",
        icon: "Warehouse",
      })));
    }

    // Search Cost Centers (scoped to org)
    const { data: costCenters } = await supabase
      .from("cost_centers")
      .select("id, code, name")
      .eq("org_id", org_id)
      .or(`code.ilike.${searchPattern},name.ilike.${searchPattern}`)
      .limit(5);

    if (costCenters) {
      results.push(...costCenters.map(cc => ({
        id: cc.id,
        type: "Cost Center",
        title: `${cc.code} - ${cc.name}`,
        href: "/controlling",
        icon: "PieChart",
      })));
    }

    return new Response(JSON.stringify({ results: results.slice(0, 20) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});