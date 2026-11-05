/**
 * One CSV cell escaper for every grower-facing export.
 *
 * Neutralises spreadsheet formula injection: a string that starts with `=`,
 * `@`, tab or CR, or with `+`/`-` when it is not a plain number, gets a leading
 * apostrophe so Excel and Sheets treat it as text. Numbers and numeric strings
 * (negative temperatures, deltas) pass through unguarded so they stay numeric.
 * Cells containing a comma, quote, CR or LF are quoted with doubled quotes.
 *
 * Pure: no I/O, no clock.
 */
const PLAIN_CSV_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  const signedNonNumber = /^[+-]/.test(s) && !PLAIN_CSV_NUMBER.test(s);
  if (/^[=@\t\r]/.test(s) || signedNonNumber) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
