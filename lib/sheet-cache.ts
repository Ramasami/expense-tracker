import { z } from "zod";
import { empty, Snapshot } from "./finance";
import { SHEET_ID } from "./public-sheet";
export type Collection = keyof Snapshot;
export type SheetCache = {
  version: 1;
  sheetId: string;
  email: string;
  data: Snapshot;
  fetchedAt: Partial<Record<Collection, number>>;
};
const DB = "budget-tracker-sheet-cache-v1";
const row = z
  .object({ id: z.string(), version: z.number(), status: z.string() })
  .catchall(z.json());
const schema = z.object({
  version: z.literal(1),
  sheetId: z.literal(SHEET_ID),
  email: z.string(),
  data: z.object(
    Object.fromEntries(
      Object.keys(empty).map((key) => [key, z.array(row).max(100000)]),
    ) as Record<Collection, z.ZodArray<typeof row>>,
  ),
  fetchedAt: z.record(z.string(), z.number().nonnegative()),
});
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
const key = (email: string) => SHEET_ID + ":" + email.toLowerCase();
export async function readSheetCache(
  email: string,
): Promise<SheetCache | null> {
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction("snapshots", "readonly");
      const request = transaction.objectStore("snapshots").get(key(email));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (!value) return null;
    const parsed = schema.safeParse(value);
    if (!parsed.success || parsed.data.email !== email.toLowerCase())
      return null;
    return parsed.data as SheetCache;
  } finally {
    db.close();
  }
}
export async function writeSheetCache(
  email: string,
  data: Snapshot,
  fetchedAt: SheetCache["fetchedAt"],
) {
  const value: SheetCache = JSON.parse(
    JSON.stringify({
      version: 1,
      sheetId: SHEET_ID,
      email: email.toLowerCase(),
      data,
      fetchedAt,
    }),
  );
  schema.parse(value);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(value, key(email));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export function screenCollections(page: string): Collection[] {
  const base: Collection[] = ["transactions", "tags", "accounts", "settings"];
  const extra: Record<string, Collection[]> = {
    Recovery: [
      "transactions",
      "tags",
      "accounts",
      "budgets",
      "goals",
      "recurring",
      "holdings",
      "settings",
      "audit",
    ],
    Budgets: ["budgets"],
    "Financial Goals": ["goals"],
    "Recurring Transactions": ["recurring"],
    "Audit History": ["audit"],
    "Transaction details": ["audit"],
    Reports: ["audit"],
    Settings: ["settings"],
  };
  return [...new Set([...base, ...(extra[page] || [])])];
}
