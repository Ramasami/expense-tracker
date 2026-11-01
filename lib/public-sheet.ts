import { empty, Snapshot, RecordData } from "./finance";
export const SHEET_ID = "12AisxtgYgO2fN2tNzbzDNfX4hyAZvksyV2DtOInc5Ls";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw Error("Google returned incomplete CSV data.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
function isoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()))
    throw Error("A sheet transaction has an unreadable date: " + value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function snapshotFromCsv(ledgerText: string, tagText: string): Snapshot {
  const data = structuredClone(empty);
  const ledger = parseCsv(ledgerText),
    tags = parseCsv(tagText);
  if (!ledger[0]?.includes("Description / Merchant") || ledger[0][0] !== "Date")
    throw Error("The public Expense Ledger has unexpected headers.");
  if (!tags[0] || !["Available Tags", "Tag Name", "name"].includes(tags[0][0]))
    throw Error("The public Expense Tags tab has unexpected headers.");
  const field = (headers: string[], names: string[]) =>
    headers.findIndex((h) => names.includes(h));
  const th = tags[0],
    lh = ledger[0];
  const tagIdIndex = field(th, ["id", "Tag ID"]);
  const statusIndex = field(th, ["status", "Status"]);
  for (const [i, row] of tags.slice(1).entries()) {
    if (!row[0]?.trim() || row[0].startsWith("__WT_PENDING__")) continue;
    data.tags.push({
      id:
        "sheet-tag-" +
        (tagIdIndex >= 0 && row[tagIdIndex] ? row[tagIdIndex] : i + 2),
      name: row[0],
      type: row[1] || "Expense",
      status:
        statusIndex >= 0 && row[statusIndex] ? row[statusIndex] : "Active",
      version: Number(row[field(th, ["version", "Version"])] || 1),
      sheetVersion: Number(row[field(th, ["version", "Version"])] || 1),
      source: "google-sheet",
      sourceRow: i + 2,
      description: row[field(th, ["description", "Description"])] || "",
      parent: row[field(th, ["parent", "Parent Category"])] || "",
      color: row[field(th, ["color", "Color"])] || "#ff385c",
      icon: row[field(th, ["icon", "Icon"])] || "#",
      spendingKind: row[field(th, ["spendingKind"])] || "Unclassified",
    });
  }
  const ti = field(lh, ["id", "Transaction ID"]),
    si = field(lh, ["status", "Status"]),
    override = field(lh, ["typeOverride"]);
  for (const [i, row] of ledger.slice(1).entries()) {
    if ((!row[0] && !row[1] && !row[4]) || row[1]?.startsWith("__WT_PENDING__"))
      continue;
    if (!row[0] || !row[1])
      throw Error(`Expense Ledger row ${i + 2} needs a date and description.`);
    const amount = Number(String(row[4]).replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0)
      throw Error(`Expense Ledger row ${i + 2} needs a positive amount.`);
    let tag = data.tags.find((t) => t.name === row[2]);
    const type =
      (override >= 0 && row[override]) || row[3] || tag?.type || "Expense";
    if (!tag) {
      tag = {
        id: "sheet-tag-extra-" + encodeURIComponent(row[2] || "Other"),
        name: row[2] || "Other",
        type,
        status: "Active",
        version: 1,
        source: "google-sheet",
      };
      // Historical unlisted tags remain readable but are not added to Expense Tags.
    }
    data.transactions.push({
      id: "sheet-tx-" + (ti >= 0 && row[ti] ? row[ti] : i + 2),
      date: isoDate(row[0]),
      description: row[1],
      tagId: tag.id,
      tag: tag.name,
      type,
      amount,
      payment: row[5] || "",
      person: ["Ram", "Varsha"].includes(row[6]) ? row[6] : "Combined",
      notes: row[7] || "",
      receipts: JSON.parse(row[field(lh, ["receipts"])] || "[]"),
      account: row[field(lh, ["account"])] || "",
      toAccount: row[field(lh, ["toAccount"])] || "",
      updatedBy: row[field(lh, ["updatedBy"])] || "",
      updatedAt: row[field(lh, ["updatedAt"])] || "",
      status: si >= 0 && row[si] ? row[si] : "Active",
      version: Number(row[field(lh, ["version", "Version"])] || 1),
      sheetVersion: Number(row[field(lh, ["version", "Version"])] || 1),
      source: "google-sheet",
      sourceRow: i + 2,
    });
  }
  // Source parent metadata may refer to a sheet tag ID or a name.
  for (const tag of data.tags) {
    if (tag.parent) {
      const parent = data.tags.find(
        (t) =>
          t.id === tag.parent ||
          t.id === "sheet-tag-" + tag.parent ||
          t.name === tag.parent,
      );
      tag.parent = parent?.id || "";
    }
  }
  for (const records of [data.tags, data.transactions]) {
    const ids = records.map((r) => r.id);
    if (new Set(ids).size !== ids.length)
      throw Error("The sheet contains duplicate stable record IDs.");
    for (const r of records) r.sourceFingerprint = JSON.stringify(r);
  }
  return data;
}
export async function readPublicSheet(signal?: AbortSignal) {
  async function read(gid: number) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&headers=1&cache=${Date.now()}`;
    const response = await fetch(url, {
      credentials: "omit",
      signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw Error(
        "The public sheet could not be read. Check its sharing settings.",
      );
    const text = await response.text();
    if (text.trimStart().startsWith("<"))
      throw Error(
        "Google returned a sign-in page. The sheet must allow public viewing.",
      );
    return text;
  }
  const [ledger, tags] = await Promise.all([read(131), read(132)]);
  return snapshotFromCsv(ledger, tags);
}
