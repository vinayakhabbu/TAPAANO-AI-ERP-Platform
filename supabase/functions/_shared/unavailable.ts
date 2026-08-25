export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Temporary production-safety boundary for workflows that do not yet have an
 * audited, tenant-scoped and transactional implementation.
 *
 * Deliberately does not read the request body, environment variables, secrets,
 * or database state and never performs an external request.
 */
export function unavailableHandler(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "workflow_unavailable",
      message: "This workflow is unavailable pending security review.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}
