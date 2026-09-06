import { isReportDate } from "./trialBalance";
import { decimal } from "./financeReports";

export type JournalLineInput = { accountId: string; debit: string; credit: string; memo: string };
export function journalAmount(value: string): bigint {
  if (!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a nonnegative amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(2, "0"));
}
export function prepareManualJournal(input: { entityId: string; number: string; date: string; memo: string; lines: JournalLineInput[]; requestKey: string }) {
  if (!input.entityId || !input.number.trim() || input.number.trim().length > 100 || !isReportDate(input.date) || input.memo.length > 2000
    || !input.requestKey || input.lines.length < 2 || input.lines.length > 500) throw new Error("Enter an entity, reference, valid date and 2–500 journal lines.");
  let debit = 0n, credit = 0n;
  const lines = input.lines.map(line => {
    const d = journalAmount(line.debit), c = journalAmount(line.credit);
    if (!line.accountId || line.memo.length > 1000 || !((d > 0n && c === 0n) || (c > 0n && d === 0n))) throw new Error("Each line needs an account and one positive debit or credit.");
    debit += d; credit += c;
    return { account_id: line.accountId, debit: decimal(d), credit: decimal(c), memo: line.memo.trim() };
  });
  if (debit === 0n || debit !== credit) throw new Error("Journal debits and credits must balance.");
  return { p_entity_id: input.entityId, p_entry_number: input.number.trim(), p_entry_date: input.date,
    p_memo: input.memo.trim() || null, p_lines: lines, p_idempotency_key: input.requestKey };
}
