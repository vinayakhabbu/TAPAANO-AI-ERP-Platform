// Keep the browser and managed-API regression on the same projection. Contained
// controlling tables have no API grants and must not be joined here.
export const JOURNAL_HISTORY_SELECT = `
  *, journal_lines!journal_lines_journal_entry_id_fkey(
    id, debit, credit, memo, cost_center_id, internal_order_id,
    profit_center_id, wbs_element_id,
    account:accounts!journal_lines_account_id_fkey(name, code, controlling_category)
  )
` as const;
