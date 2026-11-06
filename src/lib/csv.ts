/**
 * Shared CSV download helpers — one implementation for every "Excel sheet"
 * button in the app (attendance sheet, teacher document exports).
 *
 * Discipline that used to be duplicated per component:
 *  • UTF-8 BOM first — Excel renders Bangla student names correctly
 *  • proper RFC-style escaping (quotes, commas, newlines doubled/wrapped)
 *  • the <a> anchor is appended to the DOM before click (Firefox refuses
 *    clicks on detached anchors) and removed afterwards
 *  • the object URL is always revoked so no blob leaks are left behind
 */

/** Escape one CSV cell: wrap in quotes when it contains a comma, quote or
 *  line break; double any inner quotes. Numbers pass through untouched. */
export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Join a rows matrix into CSV text (LF line endings — Excel accepts them). */
export function csvRowsToText(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

/** Build + download a CSV from a rows matrix. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  downloadCsvText(filename, csvRowsToText(rows));
}

/**
 * Download an already-built CSV string (the export endpoints return the
 * final CSV text server-side). No re-escaping — the server's output is
 * taken verbatim; only the BOM + anchor + revoke discipline applies.
 */
export function downloadCsvText(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
