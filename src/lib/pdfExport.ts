import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface IncomeStatementData {
  revenue: { accounts: { code: string; name: string; balance: number }[]; total: number };
  expenses: { accounts: { code: string; name: string; balance: number }[]; total: number };
  netIncome: number;
}

interface BalanceSheetData {
  assets: { accounts: { code: string; name: string; balance: number }[]; total: number };
  liabilities: { accounts: { code: string; name: string; balance: number }[]; total: number };
  equity: { accounts: { code: string; name: string; balance: number }[]; total: number };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface InvoiceData {
  invoice_number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
}

interface BillData {
  bill_number: string;
  vendor_name: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
}

const formatCurrency = (amount: number): string => {
  const isNegative = amount < 0;
  return `${isNegative ? "(" : ""}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${isNegative ? ")" : ""}`;
};

const addHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, 20, 25);
  
  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(subtitle, 20, 33);
    doc.setTextColor(0);
  }
  
  // Add generation date
  doc.setFontSize(9);
  doc.setTextColor(128);
  doc.text(`Generated: ${format(new Date(), "MMM d, yyyy h:mm a")}`, doc.internal.pageSize.width - 20, 25, { align: "right" });
  doc.setTextColor(0);
};

const addFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }
};

export const exportIncomeStatement = (
  data: IncomeStatementData,
  periodStart: string,
  periodEnd: string
) => {
  const doc = new jsPDF();
  
  addHeader(doc, "Income Statement", `For the period ${periodStart} to ${periodEnd}`);
  
  let yPosition = 45;
  
  // Revenue Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("REVENUE", 20, yPosition);
  yPosition += 5;
  
  const revenueData = data.revenue.accounts.map(acc => [
    `${acc.code} - ${acc.name}`,
    formatCurrency(acc.balance)
  ]);
  
  if (revenueData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: revenueData,
      theme: "plain",
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 40, halign: "right" }
      },
      margin: { left: 25 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }
  
  // Revenue Total
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Total Revenue", formatCurrency(data.revenue.total)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Expenses Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("EXPENSES", 20, yPosition);
  yPosition += 5;
  
  const expenseData = data.expenses.accounts.map(acc => [
    `${acc.code} - ${acc.name}`,
    formatCurrency(acc.balance)
  ]);
  
  if (expenseData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: expenseData,
      theme: "plain",
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 40, halign: "right" }
      },
      margin: { left: 25 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }
  
  // Expenses Total
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Total Expenses", formatCurrency(data.expenses.total)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Net Income
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 8;
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("NET INCOME", 20, yPosition);
  doc.text(formatCurrency(data.netIncome), 190, yPosition, { align: "right" });
  
  addFooter(doc);
  doc.save(`income-statement-${periodStart}-to-${periodEnd}.pdf`);
};

export const exportBalanceSheet = (
  data: BalanceSheetData,
  asOfDate: string
) => {
  const doc = new jsPDF();
  
  addHeader(doc, "Balance Sheet", `As of ${asOfDate}`);
  
  let yPosition = 45;
  
  // Assets Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("ASSETS", 20, yPosition);
  yPosition += 5;
  
  const assetData = data.assets.accounts.map(acc => [
    `${acc.code} - ${acc.name}`,
    formatCurrency(acc.balance)
  ]);
  
  if (assetData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: assetData,
      theme: "plain",
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 40, halign: "right" }
      },
      margin: { left: 25 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["TOTAL ASSETS", formatCurrency(data.totalAssets)]],
    theme: "plain",
    styles: { fontSize: 11, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 15;
  
  // Liabilities Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("LIABILITIES", 20, yPosition);
  yPosition += 5;
  
  const liabilityData = data.liabilities.accounts.map(acc => [
    `${acc.code} - ${acc.name}`,
    formatCurrency(acc.balance)
  ]);
  
  if (liabilityData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: liabilityData,
      theme: "plain",
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 40, halign: "right" }
      },
      margin: { left: 25 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Total Liabilities", formatCurrency(data.liabilities.total)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Equity Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("EQUITY", 20, yPosition);
  yPosition += 5;
  
  const equityData = data.equity.accounts.map(acc => [
    `${acc.code} - ${acc.name}`,
    formatCurrency(acc.balance)
  ]);
  
  if (equityData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [],
      body: equityData,
      theme: "plain",
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 40, halign: "right" }
      },
      margin: { left: 25 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Total Equity", formatCurrency(data.equity.total)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Total Liabilities & Equity
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 8;
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL LIABILITIES & EQUITY", 20, yPosition);
  doc.text(formatCurrency(data.totalLiabilitiesAndEquity), 190, yPosition, { align: "right" });
  
  addFooter(doc);
  doc.save(`balance-sheet-${asOfDate}.pdf`);
};

export const exportInvoice = (invoice: InvoiceData) => {
  const doc = new jsPDF();
  
  addHeader(doc, "INVOICE", `#${invoice.invoice_number}`);
  
  let yPosition = 50;
  
  // Invoice details
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [
      ["Bill To:", invoice.customer_name],
      ["Issue Date:", format(new Date(invoice.issue_date), "MMM d, yyyy")],
      ["Due Date:", format(new Date(invoice.due_date), "MMM d, yyyy")],
      ["Status:", invoice.status.toUpperCase()],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 100 }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 15;
  
  // Amount summary
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [
      ["Subtotal", formatCurrency(invoice.subtotal)],
      ["Tax", formatCurrency(invoice.tax)],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 5;
  
  doc.setDrawColor(0);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 8;
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL DUE", 20, yPosition);
  doc.text(formatCurrency(invoice.total), 190, yPosition, { align: "right" });
  
  if (invoice.notes) {
    yPosition += 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Notes:", 20, yPosition);
    yPosition += 6;
    doc.setTextColor(100);
    doc.text(invoice.notes, 20, yPosition);
    doc.setTextColor(0);
  }
  
  addFooter(doc);
  doc.save(`invoice-${invoice.invoice_number}.pdf`);
};

export const exportBill = (bill: BillData) => {
  const doc = new jsPDF();
  
  addHeader(doc, "VENDOR BILL", `#${bill.bill_number}`);
  
  let yPosition = 50;
  
  // Bill details
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [
      ["Vendor:", bill.vendor_name],
      ["Issue Date:", format(new Date(bill.issue_date), "MMM d, yyyy")],
      ["Due Date:", format(new Date(bill.due_date), "MMM d, yyyy")],
      ["Status:", bill.status.toUpperCase()],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 100 }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 15;
  
  // Amount summary
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;
  
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [
      ["Subtotal", formatCurrency(bill.subtotal)],
      ["Tax", formatCurrency(bill.tax)],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
    margin: { left: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 5;
  
  doc.setDrawColor(0);
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 8;
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", 20, yPosition);
  doc.text(formatCurrency(bill.total), 190, yPosition, { align: "right" });
  
  if (bill.notes) {
    yPosition += 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Notes:", 20, yPosition);
    yPosition += 6;
    doc.setTextColor(100);
    doc.text(bill.notes, 20, yPosition);
    doc.setTextColor(0);
  }
  
  addFooter(doc);
  doc.save(`bill-${bill.bill_number}.pdf`);
};

export const exportInvoicesList = (invoices: InvoiceData[]) => {
  const doc = new jsPDF();
  
  addHeader(doc, "Invoices Report", `${invoices.length} invoices`);
  
  autoTable(doc, {
    startY: 45,
    head: [["Invoice #", "Customer", "Due Date", "Total", "Status"]],
    body: invoices.map(inv => [
      inv.invoice_number,
      inv.customer_name,
      format(new Date(inv.due_date), "MMM d, yyyy"),
      formatCurrency(inv.total),
      inv.status.toUpperCase()
    ]),
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
  });
  
  addFooter(doc);
  doc.save(`invoices-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
};

export const exportBillsList = (bills: BillData[]) => {
  const doc = new jsPDF();
  
  addHeader(doc, "Bills Report", `${bills.length} bills`);
  
  autoTable(doc, {
    startY: 45,
    head: [["Bill #", "Vendor", "Due Date", "Total", "Status"]],
    body: bills.map(bill => [
      bill.bill_number,
      bill.vendor_name,
      format(new Date(bill.due_date), "MMM d, yyyy"),
      formatCurrency(bill.total),
      bill.status.toUpperCase()
    ]),
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
  });
  
  addFooter(doc);
  doc.save(`bills-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
};

interface PayslipData {
  payslip_number: string;
  employee_name: string;
  employee_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  earnings_breakdown: Record<string, number>;
  deductions_breakdown: Record<string, number>;
  ytd_gross?: number;
  ytd_deductions?: number;
  ytd_net?: number;
}

export const exportPayslip = (payslip: PayslipData, companyName?: string) => {
  const doc = new jsPDF();
  
  // Company header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(companyName || "Company Name", 20, 20);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("PAYSLIP", 20, 28);
  doc.setTextColor(0);
  
  // Payslip number and generation date
  doc.setFontSize(9);
  doc.setTextColor(128);
  doc.text(`#${payslip.payslip_number}`, doc.internal.pageSize.width - 20, 20, { align: "right" });
  doc.text(`Generated: ${format(new Date(), "MMM d, yyyy")}`, doc.internal.pageSize.width - 20, 28, { align: "right" });
  doc.setTextColor(0);
  
  let yPosition = 40;
  
  // Employee information box
  doc.setDrawColor(200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(20, yPosition, 170, 30, 2, 2, "FD");
  
  yPosition += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Employee:", 25, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(payslip.employee_name, 60, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("Employee #:", 120, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(payslip.employee_number, 150, yPosition);
  
  yPosition += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Pay Period:", 25, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${format(new Date(payslip.period_start), "MMM d, yyyy")} - ${format(new Date(payslip.period_end), "MMM d, yyyy")}`, 60, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("Pay Date:", 120, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(payslip.pay_date), "MMM d, yyyy"), 150, yPosition);
  
  yPosition += 25;
  
  // Earnings section
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EARNINGS", 20, yPosition);
  yPosition += 2;
  
  const earningsData = Object.entries(payslip.earnings_breakdown).map(([key, value]) => [
    key,
    formatCurrency(value)
  ]);
  
  if (earningsData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [["Description", "Amount"]],
      body: earningsData,
      theme: "plain",
      headStyles: { fillColor: [34, 197, 94], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 50, halign: "right" }
      },
      margin: { left: 20, right: 20 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 3;
  }
  
  // Gross Pay subtotal
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Gross Pay", formatCurrency(payslip.gross_pay)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 50, halign: "right" }
    },
    margin: { left: 20, right: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Deductions section
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DEDUCTIONS", 20, yPosition);
  yPosition += 2;
  
  const deductionsData = Object.entries(payslip.deductions_breakdown)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => [key, formatCurrency(value)]);
  
  if (deductionsData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [["Description", "Amount"]],
      body: deductionsData,
      theme: "plain",
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 50, halign: "right" }
      },
      margin: { left: 20, right: 20 }
    });
    yPosition = (doc as any).lastAutoTable.finalY + 3;
  }
  
  // Total Deductions subtotal
  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: [["Total Deductions", formatCurrency(payslip.total_deductions)]],
    theme: "plain",
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 50, halign: "right" }
    },
    margin: { left: 20, right: 20 }
  });
  yPosition = (doc as any).lastAutoTable.finalY + 10;
  
  // Net Pay box
  doc.setDrawColor(34, 197, 94);
  doc.setFillColor(240, 253, 244);
  doc.setLineWidth(1);
  doc.roundedRect(20, yPosition, 170, 20, 2, 2, "FD");
  
  yPosition += 13;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("NET PAY", 30, yPosition);
  doc.text(formatCurrency(payslip.net_pay), 180, yPosition, { align: "right" });
  
  yPosition += 25;
  
  // YTD Summary if available
  if (payslip.ytd_gross || payslip.ytd_deductions || payslip.ytd_net) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("YEAR-TO-DATE SUMMARY", 20, yPosition);
    yPosition += 2;
    
    autoTable(doc, {
      startY: yPosition,
      head: [["", "Amount"]],
      body: [
        ["YTD Gross Earnings", formatCurrency(payslip.ytd_gross || 0)],
        ["YTD Deductions", formatCurrency(payslip.ytd_deductions || 0)],
        ["YTD Net Pay", formatCurrency(payslip.ytd_net || 0)],
      ],
      theme: "striped",
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 50, halign: "right" }
      },
      margin: { left: 20, right: 20 }
    });
  }
  
  addFooter(doc);
  doc.save(`payslip-${payslip.payslip_number}.pdf`);
};
