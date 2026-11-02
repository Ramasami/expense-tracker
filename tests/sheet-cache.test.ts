import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { empty } from "../lib/finance";
import {
  readSheetCache,
  writeSheetCache,
  screenCollections,
} from "../lib/sheet-cache";
test("Sheet cache is scoped to the verified account and preserves cloud timestamps", async () => {
  const data = structuredClone(empty);
  data.accounts.push({
    id: "bank",
    name: "Bank",
    version: 1,
    status: "Active",
    updatedBy: undefined,
  });
  await writeSheetCache("ramasami.official@gmail.com", data, {
    accounts: 123,
    transactions: 123,
    tags: 123,
  });
  const cached = await readSheetCache("ramasami.official@gmail.com");
  assert.equal(cached?.data.accounts[0].name, "Bank");
  assert.equal(cached?.fetchedAt.accounts, 123);
  assert.equal(await readSheetCache("tnvarsha.99@gmail.com"), null);
});
test("screens request only their needed supporting collections", () => {
  assert.deepEqual(screenCollections("Dashboard"), [
    "transactions",
    "tags",
    "accounts",
    "settings",
  ]);
  assert.deepEqual(screenCollections("Budgets"), [
    "transactions",
    "tags",
    "accounts",
    "settings",
    "budgets",
  ]);
  assert.equal(screenCollections("Transactions").includes("audit"), false);
  assert.equal(
    screenCollections("Transaction details").includes("audit"),
    true,
  );
});
