import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "approval" | "time_off_request" | "time_off_response";
  recipientEmail: string;
  recipientName: string;
  subject: string;
  details: Record<string, string>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured - skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: "Email skipped - API key not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { type, recipientEmail, recipientName, subject, details }: NotificationRequest = await req.json();

    let htmlContent = "";

    switch (type) {
      case "approval":
        htmlContent = `
          <h2>Approval Request</h2>
          <p>Hello ${recipientName},</p>
          <p>A new item requires your approval:</p>
          <ul>
            ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
          </ul>
          <p>Please log in to the system to review and take action.</p>
        `;
        break;

      case "time_off_request":
        htmlContent = `
          <h2>Time Off Request Submitted</h2>
          <p>Hello ${recipientName},</p>
          <p>A new time off request has been submitted:</p>
          <ul>
            ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
          </ul>
          <p>Please log in to review and approve/reject this request.</p>
        `;
        break;

      case "time_off_response":
        htmlContent = `
          <h2>Time Off Request ${details.status}</h2>
          <p>Hello ${recipientName},</p>
          <p>Your time off request has been <strong>${details.status}</strong>.</p>
          <ul>
            ${Object.entries(details).filter(([key]) => key !== "status").map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
          </ul>
        `;
        break;

      default:
        htmlContent = `
          <h2>Notification</h2>
          <p>Hello ${recipientName},</p>
          <p>${subject}</p>
        `;
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ERP System <onboarding@resend.dev>",
        to: [recipientEmail],
        subject: subject,
        html: htmlContent,
      }),
    });

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-notification function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
