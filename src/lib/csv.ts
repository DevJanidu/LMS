/** Prevent spreadsheet formulas in exported, user-controlled account fields. */
export function csvCell(input: unknown) {
  const value = String(input);
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
