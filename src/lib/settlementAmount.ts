import { isReportDate } from "./trialBalance";
import { journalAmount } from "./manualJournal";
import { decimal } from "./financeReports";

export function prepareSettlement(input: { documentId: string; number: string; date: string; issueDate: string; currency: string; amount: string; reference: string; requestKey: string }) {
  const number = input.number.trim(), reference = input.reference.trim();
  if (!input.documentId || !number || number.length > 80 || !reference || reference.length > 240
    || [...number + reference].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !input.requestKey || input.requestKey.length > 160
    || !/^[A-Z]{3}$/.test(input.currency) || !isReportDate(input.date) || !isReportDate(input.issueDate) || input.date < input.issueDate) {
    throw new Error("Enter a reference, document number and valid date on or after the document date.");
  }
  const amount = journalAmount(input.amount);
  if (amount <= 0n) throw new Error("Enter a positive settlement amount.");
  return { number, date: input.date, documentId: input.documentId, p_currency: input.currency,
    p_reference: reference, p_idempotency_key: input.requestKey, p_amount: decimal(amount) };
}
