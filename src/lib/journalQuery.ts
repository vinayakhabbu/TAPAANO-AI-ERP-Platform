// Keep the browser and managed-API regression on the same projection. Contained
// controlling tables have no API grants and must not be joined here.
export const JOURNAL_HISTORY_SELECT = `
  *, journal_lines(
    id, debit, credit, memo, cost_center_id, internal_order_id,
    profit_center_id, wbs_element_id,
    account:accounts(name, code, controlling_category)
  )
` as const;
