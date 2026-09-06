type Page<T> = { data: T[] | null; count: number | null; error: unknown };

/** Read a stable, uniquely ordered history without treating an API cap as EOF. */
export async function readAllRows<T extends { id: string }>(
  readPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  const pageSize = 250;
  const maximumRows = 50_000;
  let expectedCount: number | undefined;

  while (true) {
    const { data, count, error } = await readPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data || !Number.isSafeInteger(count) || count < 0 || count > maximumRows) {
      throw new Error("Complete history is unavailable. Narrow the reporting scope or contact your administrator.");
    }
    if (expectedCount !== undefined && count !== expectedCount) {
      throw new Error("History changed during loading. Refresh to retry.");
    }
    expectedCount = count;
    if (data.length > pageSize || rows.length + data.length > count) {
      throw new Error("History returned an inconsistent page.");
    }
    for (const row of data) {
      if (seen.has(row.id)) throw new Error("History changed during loading. Refresh to retry.");
      seen.add(row.id);
      rows.push(row);
    }
    if (rows.length === count) return rows;
    if (data.length === 0) throw new Error("History ended before all records were loaded.");
    // A server can cap a page below pageSize. Continue from the actual offset.
  }
}
