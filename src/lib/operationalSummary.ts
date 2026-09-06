export const summaryCountKeys = [
  "customerCount", "invoiceCount", "fullCreditCount", "fullReceiptCount",
  "receiptCorrectionCount", "receiptReplacementCount", "vendorCount",
  "billHeaderCount", "postedBillCount", "postedCreditCount", "postedPaymentCount",
  "paymentCorrectionCount", "paymentReplacementCount", "paymentRunHistoryCount",
  "bankAccountCount", "openPeriodCount",
] as const;

export type OperationalSummary = Record<typeof summaryCountKeys[number], number> & {
  postedInvoiceTotals: { currency: string; total: string }[];
};

export function parseOperationalSummary(value: unknown): OperationalSummary {
  if (!value || typeof value !== "object") throw new Error("Financial summary is unavailable.");
  const summary = value as Record<string, unknown>;
  for (const key of summaryCountKeys) {
    if (!Number.isSafeInteger(summary[key]) || (summary[key] as number) < 0) {
      throw new Error("Financial summary contains an invalid count.");
    }
  }
  if (!Array.isArray(summary.postedInvoiceTotals)) throw new Error("Currency totals are unavailable.");
  const currencies = new Set<string>();
  for (const item of summary.postedInvoiceTotals) {
    if (!item || typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)
      || typeof item.total !== "string" || !/^\d+\.\d{2}$/.test(item.total)
      || currencies.has(item.currency)) {
      throw new Error("Financial summary contains an invalid currency total.");
    }
    currencies.add(item.currency);
  }
  return summary as OperationalSummary;
}

/** Preserve decimal precision even when a tenant's aggregate exceeds Number's safe range. */
export function formatCurrencyTotal(currency: string, total: string): string {
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d+\.\d{2}$/.test(total)) {
    throw new Error("Invalid currency total.");
  }
  const [integer, fraction] = total.split(".");
  return `${currency} ${new Intl.NumberFormat("en-US").format(BigInt(integer))}.${fraction}`;
}
