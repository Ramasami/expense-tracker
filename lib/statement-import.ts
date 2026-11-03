import { duplicateReason } from "./smart-finance";
import type { RecordData } from "./finance";
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.length)
        throw Error("Unexpected quote in CSV.");
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (quoted) throw Error("CSV contains an unfinished quoted field.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2)
    throw Error("Choose a CSV with a header and at least one transaction.");
  if (rows.length > 501)
    throw Error("Import up to 500 transactions at a time.");
  return rows;
}
export function statementDate(value: string, format: "DMY" | "MDY" = "DMY") {
  const s = value.trim();
  let iso = s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const match = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!match) throw Error("Use YYYY-MM-DD or a numeric day/month/year date.");
    const a = match[1].padStart(2, "0"),
      b = match[2].padStart(2, "0");
    iso = `${match[3]}-${format === "DMY" ? b : a}-${format === "DMY" ? a : b}`;
  }
  if (
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) !== iso
  )
    throw Error("Invalid date.");
  return iso;
}
export function statementAmount(s: string) {
  const clean = s
    .trim()
    .replace(/[₹,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(clean)) throw Error("Invalid amount.");
  const n = Number(clean);
  if (!Number.isFinite(n)) throw Error("Invalid amount.");
  return n;
}
export function duplicateKey(row: Partial<RecordData>) {
  return [
    row.date,
    row.account,
    row.type,
    row.expenseMode || "Debit",
    row.creditCardId || "",
    Math.round(Number(row.amount) * 100),
    String(row.description || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " "),
  ].join("|");
}
export function statementDuplicates(
  rows: Partial<RecordData>[],
  existing: RecordData[],
) {
  const seen = new Set(
    existing.filter((r) => r.status === "Active").map(duplicateKey),
  );
  const bucket = (row: Partial<RecordData>) =>
    [row.account, row.type, Math.round(Number(row.amount) * 100)].join("|");
  const candidates = new Map<string, Partial<RecordData>[]>();
  for (const row of existing.filter((r) => r.status === "Active")) {
    const key = bucket(row);
    candidates.set(key, [...(candidates.get(key) || []), row]);
  }
  return rows.map((row) => {
    const key = duplicateKey(row),
      group = bucket(row);
    const prior = candidates.get(group) || [];
    const candidate = { ...row, id: undefined };
    const duplicate =
      seen.has(key) || prior.some((r) => !!duplicateReason(candidate, r));
    seen.add(key);
    candidates.set(group, [...prior, row]);
    return duplicate;
  });
}
