import { test } from "node:test";
import assert from "node:assert/strict";
import { signInGoogle, disconnectGoogle } from "../lib/google-auth";
import {
  saveGoogle,
  recordRequests,
  dateSerial,
  ensureGoogleSchema,
} from "../lib/google-sheets";
import { fixture } from "./sheets-fixture";
async function signed<T>(fn: (f: ReturnType<typeof fixture>) => Promise<T>) {
  const f = fixture(),
    originalFetch = globalThis.fetch;
  const authStorage = new Map<string, string>();
  const legacyStorage = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => legacyStorage.get(key) || null,
    setItem: (key: string, value: string) => legacyStorage.set(key, value),
    removeItem: (key: string) => legacyStorage.delete(key),
  };
  globalThis.fetch = f.fetcher;
  (globalThis as any).window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => ({
            requestAccessToken: () =>
              config.callback({
                access_token: "test-token",
                expires_in: 3600,
                scope: "https://www.googleapis.com/auth/spreadsheets",
              }),
          }),
        },
      },
    },
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) =>
      key === "wealthtrack-google-client-id"
        ? "123-test.apps.googleusercontent.com"
        : authStorage.get(key) || null,
    setItem: (key: string, value: string) => authStorage.set(key, value),
    removeItem: (key: string) => authStorage.delete(key),
  };
  try {
    await signInGoogle();
    return await fn(f);
  } finally {
    disconnectGoogle();
    globalThis.fetch = originalFetch;
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
  }
}
const tx = {
  account: "ram-bank",
  date: "2026-11-01",
  description: "New expense",
  amount: 150,
  type: "Expense",
  tagId: "sheet-tag-2",
  person: "Ram",
  payment: "UPI",
};
test("direct expense write updates Expense Ledger and audit, then confirms readback", () =>
  signed(async (f) => {
    const result = await saveGoogle({
      entity: "transactions",
      action: "create",
      record: tx,
      operationId: crypto.randomUUID(),
    });
    assert.equal(result.ok, true);
    assert.equal(f.grids["Expense Ledger"][2][1], "New expense");
    assert.equal(f.grids["Expense Ledger"][2][4], 150);
    assert.equal(result.record?.sheetVersion, 1);
    assert.equal(f.grids["Audit Log"].length, 2);
    assert.equal(f.grids["Audit Log"][1][11], "ramasami.official@gmail.com");
  }));
test("account writes update the Accounts tab and retry does not duplicate", () =>
  signed(async (f) => {
    const op = {
      entity: "accounts",
      action: "create",
      record: {
        name: "My ledger",
        type: "Custom",
        openingBalance: 1000,
        person: "Ram",
      },
      operationId: crypto.randomUUID(),
    };
    const first = await saveGoogle(op),
      second = await saveGoogle(op);
    assert.equal(first.record?.id, second.record?.id);
    assert.equal(f.grids.Accounts.length, 4);
    assert.equal(JSON.parse(f.grids.Accounts.at(-1)![7]).openingBalance, 1000);
    assert.equal(f.batches(), 1);
  }));
test("a lost response is recovered by its operation receipt", () =>
  signed(async (f) => {
    const op = {
      entity: "transactions",
      action: "create",
      record: tx,
      operationId: crypto.randomUUID(),
    };
    f.fail();
    await assert.rejects(saveGoogle(op), /did not confirm/);
    const retry = await saveGoogle(op);
    assert.equal(retry.ok, true);
    assert.equal(f.grids["Expense Ledger"].length, 3);
    assert.equal(f.grids["Audit Log"].length, 2);
  }));
test("stale sheet version is rejected before writing", () =>
  signed(async (f) => {
    f.grids["Expense Ledger"][1][12] = 2;
    const result = await saveGoogle({
      entity: "transactions",
      action: "edit",
      record: {
        ...tx,
        id: "sheet-tx-2",
        version: 1,
        sheetVersion: 1,
        source: "google-sheet",
      },
      operationId: crypto.randomUUID(),
    });
    assert.equal(result.conflict, true);
    assert.equal(f.batches(), 0);
  }));
test("transaction edits never write the Type or Month array outputs and retain unchanged date formulas", () => {
  const r = { ...tx, id: "sheet-tx-2", version: 2, status: "Active" };
  const requests = recordRequests(
    "transactions",
    r,
    r,
    131,
    2,
    "op",
    "ramasami.official@gmail.com",
  );
  for (const request of requests) {
    const range = request.updateCells.range;
    assert.equal(
      range.startColumnIndex <= 3 && range.endColumnIndex > 3,
      false,
    );
    assert.equal(
      range.startColumnIndex <= 8 && range.endColumnIndex > 8,
      false,
    );
    assert.notEqual(range.startColumnIndex, 0);
  }
  assert.equal(dateSerial("2026-11-01"), 46327);
});

test("first connection backs up every changed original tab and preserves financial values", () =>
  signed(async (f) => {
    f.unprepared();
    await ensureGoogleSchema();
    assert.equal(f.requests.filter((r) => r.duplicateSheet).length, 4);
    assert.equal(f.grids["Expense Ledger"][1][4], 250);
    assert.match(f.grids["Expense Ledger"][1][3], /ARRAYFORMULA/);
    assert.match(f.grids["Monthly Expense Tracker"][0][0], /<>Deleted/);
    assert.equal(f.grids["Expense Ledger"][1][10], "2");
    assert.ok(
      f.properties.find((p) =>
        p.title.startsWith("WT Recovery Expense Ledger"),
      ),
    );
  }));
test("lost staging response retries the same pending row", () =>
  signed(async (f) => {
    const operation = {
      entity: "transactions",
      action: "create",
      record: tx,
      operationId: crypto.randomUUID(),
    };
    f.failAppend();
    await assert.rejects(saveGoogle(operation), /did not confirm/);
    await saveGoogle(operation);
    assert.equal(f.grids["Expense Ledger"].length, 3);
    assert.equal(f.grids["Audit Log"].length, 2);
  }));

test("transaction receipt links survive a Sheets save and readback", () =>
  signed(async (f) => {
    const receipt = {
      id: "receipt-file",
      name: "bill.png",
      mimeType: "image/png",
      size: 100,
      uploadedAt: "2026-11-01",
    };
    const saved = await saveGoogle({
      entity: "transactions",
      action: "create",
      record: {
        ...tx,
        account: "ram-bank",
        toAccount: "",
        receipts: [receipt],
      },
      operationId: "receipt-op",
      actor: "ignored",
    });
    assert.deepEqual(saved.record.receipts, [receipt]);
    assert.deepEqual(JSON.parse(f.grids["Expense Ledger"].at(-1)![22]), [
      receipt,
    ]);
  }));
