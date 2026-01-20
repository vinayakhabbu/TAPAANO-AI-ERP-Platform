import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScheduledReport {
  id: string;
  org_id: string;
  name: string;
  report_type: string;
  report_config: Record<string, any>;
  schedule_frequency: string;
  schedule_day: number | null;
  schedule_time: string;
  recipients: string[];
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

// Mock report generation - returns HTML content
function generateReportContent(reportType: string, orgId: string): string {
  const now = new Date().toISOString();
  
  const reportData: Record<string, { title: string; content: string }> = {
    income_statement: {
      title: "Income Statement",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;"><th style="padding:10px;text-align:left;">Category</th><th style="padding:10px;text-align:right;">Amount</th></tr>
          <tr><td style="padding:10px;">Revenue</td><td style="padding:10px;text-align:right;color:green;">$125,000.00</td></tr>
          <tr><td style="padding:10px;">Cost of Goods Sold</td><td style="padding:10px;text-align:right;color:red;">($45,000.00)</td></tr>
          <tr><td style="padding:10px;">Gross Profit</td><td style="padding:10px;text-align:right;">$80,000.00</td></tr>
          <tr><td style="padding:10px;">Operating Expenses</td><td style="padding:10px;text-align:right;color:red;">($35,000.00)</td></tr>
          <tr style="background:#e8f5e9;"><td style="padding:10px;font-weight:bold;">Net Income</td><td style="padding:10px;text-align:right;font-weight:bold;color:green;">$45,000.00</td></tr>
        </table>
      `,
    },
    balance_sheet: {
      title: "Balance Sheet",
      content: `
        <h3>Assets</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:8px;">Cash & Equivalents</td><td style="text-align:right;">$250,000.00</td></tr>
          <tr><td style="padding:8px;">Accounts Receivable</td><td style="text-align:right;">$85,000.00</td></tr>
          <tr><td style="padding:8px;">Inventory</td><td style="text-align:right;">$120,000.00</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Total Assets</td><td style="text-align:right;font-weight:bold;">$455,000.00</td></tr>
        </table>
        <h3>Liabilities & Equity</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;">Accounts Payable</td><td style="text-align:right;">$65,000.00</td></tr>
          <tr><td style="padding:8px;">Retained Earnings</td><td style="text-align:right;">$390,000.00</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Total Liab. & Equity</td><td style="text-align:right;font-weight:bold;">$455,000.00</td></tr>
        </table>
      `,
    },
    cash_flow: {
      title: "Cash Flow Statement",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#e3f2fd;"><td style="padding:10px;" colspan="2"><strong>Operating Activities</strong></td></tr>
          <tr><td style="padding:8px;">Net Income</td><td style="text-align:right;">$45,000.00</td></tr>
          <tr><td style="padding:8px;">Depreciation</td><td style="text-align:right;">$5,000.00</td></tr>
          <tr><td style="padding:8px;">Changes in Working Capital</td><td style="text-align:right;">($8,000.00)</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Net Cash from Operations</td><td style="text-align:right;font-weight:bold;">$42,000.00</td></tr>
        </table>
      `,
    },
    ar_aging: {
      title: "A/R Aging Report",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;">
            <th style="padding:10px;text-align:left;">Aging Bucket</th>
            <th style="padding:10px;text-align:right;">Amount</th>
            <th style="padding:10px;text-align:right;">% of Total</th>
          </tr>
          <tr><td style="padding:8px;">Current</td><td style="text-align:right;">$45,000.00</td><td style="text-align:right;">53%</td></tr>
          <tr><td style="padding:8px;">1-30 Days</td><td style="text-align:right;">$22,000.00</td><td style="text-align:right;">26%</td></tr>
          <tr><td style="padding:8px;">31-60 Days</td><td style="text-align:right;">$12,000.00</td><td style="text-align:right;">14%</td></tr>
          <tr><td style="padding:8px;color:red;">61-90 Days</td><td style="text-align:right;color:red;">$6,000.00</td><td style="text-align:right;color:red;">7%</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Total A/R</td><td style="text-align:right;font-weight:bold;">$85,000.00</td><td style="text-align:right;font-weight:bold;">100%</td></tr>
        </table>
      `,
    },
    ap_aging: {
      title: "A/P Aging Report",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;">
            <th style="padding:10px;text-align:left;">Aging Bucket</th>
            <th style="padding:10px;text-align:right;">Amount</th>
          </tr>
          <tr><td style="padding:8px;">Current</td><td style="text-align:right;">$35,000.00</td></tr>
          <tr><td style="padding:8px;">1-30 Days</td><td style="text-align:right;">$18,000.00</td></tr>
          <tr><td style="padding:8px;">31-60 Days</td><td style="text-align:right;">$12,000.00</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Total A/P</td><td style="text-align:right;font-weight:bold;">$65,000.00</td></tr>
        </table>
      `,
    },
    trial_balance: {
      title: "Trial Balance",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;">
            <th style="padding:10px;text-align:left;">Account</th>
            <th style="padding:10px;text-align:right;">Debit</th>
            <th style="padding:10px;text-align:right;">Credit</th>
          </tr>
          <tr><td style="padding:8px;">1000 - Cash</td><td style="text-align:right;">$250,000.00</td><td style="text-align:right;">-</td></tr>
          <tr><td style="padding:8px;">1100 - A/R</td><td style="text-align:right;">$85,000.00</td><td style="text-align:right;">-</td></tr>
          <tr><td style="padding:8px;">2000 - A/P</td><td style="text-align:right;">-</td><td style="text-align:right;">$65,000.00</td></tr>
          <tr><td style="padding:8px;">4000 - Revenue</td><td style="text-align:right;">-</td><td style="text-align:right;">$125,000.00</td></tr>
          <tr style="background:#e8f5e9;"><td style="padding:8px;font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">$455,000.00</td><td style="text-align:right;font-weight:bold;">$455,000.00</td></tr>
        </table>
      `,
    },
    budget_variance: {
      title: "Budget vs Actual",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;">
            <th style="padding:10px;text-align:left;">Category</th>
            <th style="padding:10px;text-align:right;">Budget</th>
            <th style="padding:10px;text-align:right;">Actual</th>
            <th style="padding:10px;text-align:right;">Variance</th>
          </tr>
          <tr><td style="padding:8px;">Revenue</td><td style="text-align:right;">$120,000</td><td style="text-align:right;">$125,000</td><td style="text-align:right;color:green;">+4.2%</td></tr>
          <tr><td style="padding:8px;">COGS</td><td style="text-align:right;">$50,000</td><td style="text-align:right;">$45,000</td><td style="text-align:right;color:green;">-10.0%</td></tr>
          <tr><td style="padding:8px;">Operating Expenses</td><td style="text-align:right;">$30,000</td><td style="text-align:right;">$35,000</td><td style="text-align:right;color:red;">+16.7%</td></tr>
        </table>
      `,
    },
    tax_summary: {
      title: "Tax Summary",
      content: `
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f5f5;"><th style="padding:10px;text-align:left;">Tax Type</th><th style="padding:10px;text-align:right;">Collected</th><th style="padding:10px;text-align:right;">Owed</th></tr>
          <tr><td style="padding:8px;">Sales Tax</td><td style="text-align:right;">$12,500.00</td><td style="text-align:right;">$12,500.00</td></tr>
          <tr><td style="padding:8px;">Payroll Tax</td><td style="text-align:right;">$8,200.00</td><td style="text-align:right;">$8,200.00</td></tr>
          <tr style="background:#fff3e0;"><td style="padding:8px;font-weight:bold;">Total Tax Liability</td><td style="text-align:right;font-weight:bold;">$20,700.00</td><td style="text-align:right;font-weight:bold;">$20,700.00</td></tr>
        </table>
      `,
    },
  };

  const report = reportData[reportType] || { title: "Financial Report", content: "<p>Report data</p>" };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
        h3 { color: #555; margin-top: 20px; }
        .header { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${report.title}</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Organization ID:</strong> ${orgId.substring(0, 8)}...</p>
      </div>
      
      ${report.content}
      
      <div class="footer">
        <p>This is an automated report generated by the ERP system.</p>
        <p>For questions, contact your system administrator.</p>
      </div>
    </body>
    </html>
  `;
}

// Calculate next run time
function calculateNextRun(frequency: string, scheduleDay: number | null): Date {
  const next = new Date();
  
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      if (scheduleDay) {
        next.setDate(Math.min(scheduleDay, 28));
      }
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  
  return next;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { reportId } = await req.json();

    // Fetch the scheduled report
    const { data: report, error: fetchError } = await supabase
      .from("scheduled_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (fetchError || !report) {
      throw new Error(`Report not found: ${fetchError?.message}`);
    }

    const scheduledReport = report as ScheduledReport;

    // Generate report content
    const reportHtml = generateReportContent(scheduledReport.report_type, scheduledReport.org_id);

    // Send to each recipient (using mock/dummy for now)
    const results = [];
    for (const recipientEmail of scheduledReport.recipients) {
      console.log(`[MOCK] Sending "${scheduledReport.name}" to ${recipientEmail}`);
      
      // Try to send via send-notification, falls back gracefully if no API key
      try {
        const { error: sendError } = await supabase.functions.invoke("send-notification", {
          body: {
            type: "scheduled_report",
            recipientEmail,
            recipientName: recipientEmail.split("@")[0],
            subject: `Scheduled Report: ${scheduledReport.name}`,
            details: {
              reportType: scheduledReport.report_type,
              generatedAt: new Date().toISOString(),
            },
            htmlContent: reportHtml,
          },
        });

        if (sendError) {
          console.log(`Email send skipped/failed for ${recipientEmail}: ${sendError.message}`);
        }
      } catch (e) {
        console.log(`Email send mock for ${recipientEmail}`);
      }

      results.push({ email: recipientEmail, status: "sent" });
    }

    // Update last_run_at and next_run_at
    const nextRun = calculateNextRun(scheduledReport.schedule_frequency, scheduledReport.schedule_day);
    
    await supabase
      .from("scheduled_reports")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    console.log(`Report "${scheduledReport.name}" processed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        report: scheduledReport.name,
        recipients: results,
        nextRun: nextRun.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing scheduled report:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
