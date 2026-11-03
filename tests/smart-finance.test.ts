import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cashForecast,
  duplicateReason,
  duplicatePairs,
  suggestCategory,
} from "../lib/smart-finance";
import { statementDuplicates } from "../lib/statement-import";
import type { RecordData } from "../lib/finance";
const row = (v: any = {}): RecordData => ({
  id: crypto.randomUUID(),
  version: 1,
  status: "Active",
  account: "a",
  date: "2026-11-01",
  type: "Expense",
  description: "Green Garden Cafe",
  amount: 100,
  ...v,
});
const account = row({ id: "a", openingBalance: 1000 });
test("duplicates use instrument, amount, date, merchant and reference without confusing settlements", () => {
  const original = row();
  assert.match(
    duplicateReason(
      original,
      row({ description: "UPI Green Garden Cafe 123456", date: "2026-11-02" }),
    ),
    /merchant/,
  );
  for (const change of [
    { account: "b" },
    { expenseMode: "Credit", creditCardId: "c" },
    { type: "Income" },
    { amount: 100.01 },
    { date: "2026-11-04" },
    { status: "Deleted" },
    { cardRefund: true },
    { creditPayment: true, type: "Transfer" },
    { toAccount: "b" },
    { currency: "USD" },
  ])
    assert.equal(
      duplicateReason(original, row(change)),
      "",
      JSON.stringify(change),
    );
  assert.equal(duplicateReason(original, { ...original }), "");
  assert.equal(
    duplicateReason(row({ reference: "x" }), row({ reference: "y" })),
    "",
  );
  assert.match(
    duplicateReason(
      row({ reference: "x" }),
      row({ reference: "x", description: "Different" }),
    ),
    /reference/,
  );
  assert.equal(
    duplicateReason(
      row({ description: "UPI payment 123" }),
      row({ description: "UPI payment 456" }),
    ),
    "",
  );
  assert.deepEqual(
    statementDuplicates(
      [row({ description: "Green Garden Cafe 789" })],
      [original],
    ),
    [true],
  );
  assert.deepEqual(
    statementDuplicates(
      [row(), row({ description: "UPI Green Garden Cafe 99" })],
      [],
    ),
    [false, true],
  );
  assert.equal(
    duplicatePairs([
      original,
      row(),
      row({ account: "b" }),
      row({ status: "Deleted" }),
    ]).length,
    1,
  );
});
test("category suggestions learn only from confirmed same-account history and active type-matching tags", () => {
  const tags = [
    row({ id: "food", type: "Expense", name: "Food" }),
    row({ id: "travel", type: "Expense", name: "Travel" }),
  ];
  const proposal = row({ tagId: "" });
  const history = [
    row({ tagId: "food", date: "2026-10-01" }),
    row({ tagId: "food", date: "2026-10-03" }),
    row({ tagId: "food", date: "2026-10-05" }),
  ];
  assert.equal(
    suggestCategory(proposal, history, tags)?.confidence,
    "Strong match",
  );
  assert.equal(
    suggestCategory(proposal, [row({ tagId: "food", account: "b" })], tags),
    null,
  );
  assert.equal(
    suggestCategory(
      proposal,
      [row({ tagId: "food", status: "Deleted" })],
      tags,
    ),
    null,
  );
  assert.equal(
    suggestCategory(proposal, history, [{ ...tags[0], status: "Deleted" }]),
    null,
  );
  assert.equal(
    suggestCategory({ ...proposal, type: "Income" }, history, tags),
    null,
  );
  assert.equal(
    suggestCategory(
      proposal,
      [...history, row({ tagId: "travel", updatedAt: "2026-11-03T12:00:00Z" })],
      tags,
    ),
    null,
  );
  assert.equal(
    suggestCategory(
      { ...proposal, description: "Unknown shop" },
      history,
      tags,
    ),
    null,
  );
  assert.equal(
    suggestCategory({ ...proposal, loanPayment: true }, history, tags),
    null,
  );
});
test("forecast counts actual cash, excludes double-counted purchases and internal transfers, and starts as of today", () => {
  const rows = [
    row({ type: "Income", amount: 3000 }),
    row({ amount: 300 }),
    row({ amount: 400, expenseMode: "Credit", creditCardId: "card" }),
    row({
      type: "Transfer",
      creditPayment: true,
      toAccount: "a",
      amount: 100,
      paidTransactionIds: [],
    }),
    row({ type: "Investment", amount: 200 }),
    row({
      loanPayment: true,
      amount: 500,
      principalPaid: 450,
      interestPaid: 50,
    }),
    row({ type: "Transfer", toAccount: "b", amount: 200 }),
    row({ type: "Expense", amount: 9999, status: "Deleted" }),
    row({ type: "Income", amount: 9999, date: "2026-12-01" }),
  ];
  const result = cashForecast(
    [account, row({ id: "b", openingBalance: 0 })],
    rows,
    "2026-11-02",
    { days: 30 },
  );
  assert.equal(result.opening, 2900); // 1000 + 3000 - 300 - 100 - 200 - 500, transfer cancels.
  assert.equal(result.assumptions.monthlyIncome, 3000);
  assert.equal(result.assumptions.monthlyOutflow, 1100);
  assert.equal(result.end, 4800);
  assert.equal(result.knownUnpaid, 400);
  assert.equal(result.futureRecorded, 1);
  assert.equal(
    cashForecast([account], rows, "2026-11-02", { days: 30 }).opening,
    2700,
  );
});
test("forecast scenarios validate values and show shortfall without changing source records", () => {
  const rows = [row({ type: "Income", amount: 100 })];
  const before = JSON.stringify(rows);
  const result = cashForecast([account], rows, "2026-11-02", {
    monthlyIncome: 0,
    monthlyOutflow: 3000,
    adjustment: -200,
    adjustmentDay: 2,
    days: 30,
  });
  assert.equal(result.opening, 1100);
  assert.equal(result.end, -2100);
  assert.equal(result.shortfall, "2026-11-12");
  assert.equal(JSON.stringify(rows), before);
  for (const s of [
    { monthlyIncome: NaN },
    { monthlyOutflow: -1 },
    { days: 0 },
    { days: 366 },
    { adjustmentDay: 1.5 },
    { adjustment: Infinity },
  ])
    assert.throws(() => cashForecast([account], [], "2026-11-02", s));
  assert.equal(cashForecast([account], [], "2026-11-02").end, 1000);
});
