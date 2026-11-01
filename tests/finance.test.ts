import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totals,
  balance,
  dateRange,
  filterRows,
  csv,
  RecordData,
} from "../lib/finance";
const row = (v: any): RecordData => ({
  id: "x",
  version: 1,
  status: "Active",
  date: "2026-11-01",
  person: "Ram",
  ...v,
});
test("investments reduce cash but not savings; transfers do not inflate income", () =>
  assert.deepEqual(
    totals([
      row({ type: "Income", amount: 1000 }),
      row({ type: "Expense", amount: 200 }),
      row({ type: "Investment", amount: 300 }),
      row({ type: "Transfer", amount: 100 }),
      row({ type: "Expense", amount: 999, status: "Deleted" }),
    ]),
    { income: 1000, expense: 200, investment: 300, net: 500, savings: 80 },
  ));
test("transfer conserves combined account cash", () => {
  const rows = [
    row({ type: "Transfer", amount: 100, account: "a", toAccount: "b" }),
  ];
  assert.equal(balance(row({ id: "a", openingBalance: 500 }), rows), 400);
  assert.equal(balance(row({ id: "b", openingBalance: 20 }), rows), 120);
});
test("person and dates filter consistently", () =>
  assert.equal(
    filterRows(
      [row({}), row({ person: "Varsha" }), row({ date: "2025-01-01" })],
      "Ram",
      "2026-11-01",
      "2026-11-30",
    ).length,
    1,
  ));
test("financial year boundary and leap-year last month", () => {
  assert.deepEqual(
    dateRange("This Financial Year", new Date("2026-02-10T12:00:00Z")),
    ["2025-04-01", "2026-02-10"],
  );
  assert.deepEqual(dateRange("Last Month", new Date("2024-03-10T12:00:00Z")), [
    "2024-02-01",
    "2024-02-29",
  ]);
});
test("CSV quotes and formula injection protection", () => {
  assert.match(
    csv([{ merchant: '=HYPERLINK("evil")', note: "a,b" }]),
    /'=HYPERLINK/,
  );
  assert.match(csv([{ note: "a,b" }]), /"a,b"/);
});
