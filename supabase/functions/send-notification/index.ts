import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "approval" | "time_off_request" | "time_off_response" | "scheduled_report" | "expense_claim" | "payment_reminder";
  recipientEmail: string;
  recipientName: string;
  subject: string;
  details: Record<string, string>;
  htmlContent?: string; // For pre-formatted content like reports
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

    const { type, recipientEmail, recipientName, subject, details, htmlContent }: NotificationRequest = await req.json();

    let emailHtml = "";

    // If pre-formatted HTML content is provided, use it directly
    if (htmlContent) {
      emailHtml = htmlContent;
    } else {
      switch (type) {
        case "approval":
          emailHtml = `
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
          emailHtml = `
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
          emailHtml = `
            <h2>Time Off Request ${details.status}</h2>
            <p>Hello ${recipientName},</p>
            <p>Your time off request has been <strong>${details.status}</strong>.</p>
            <ul>
              ${Object.entries(details).filter(([key]) => key !== "status").map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
            </ul>
          `;
          break;

        case "expense_claim":
          emailHtml = `
            <h2>Expense Claim ${details.status || "Update"}</h2>
            <p>Hello ${recipientName},</p>
            <p>Your expense claim has been updated:</p>
            <ul>
              ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
            </ul>
            <p>Log in to view details.</p>
          `;
          break;

        case "payment_reminder":
          emailHtml = `
            <h2>Payment Reminder</h2>
            <p>Hello ${recipientName},</p>
            <p>This is a reminder about an upcoming or overdue payment:</p>
            <ul>
              ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
            </ul>
            <p>Please take action as needed.</p>
          `;
          break;

        case "scheduled_report":
          emailHtml = `
            <h2>Scheduled Report: ${subject}</h2>
            <p>Hello ${recipientName},</p>
            <p>Your scheduled report is ready:</p>
            <ul>
              ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join("")}
            </ul>
          `;
          break;

        default:
          emailHtml = `
            <h2>Notification</h2>
            <p>Hello ${recipientName},</p>
            <p>${subject}</p>
          `;
      }
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
        html: emailHtml,
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
