import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingCycle,
  loanForecast,
  reconcile,
  monthlySpending,
} from "../lib/planning";
import {
  parseCSV,
  statementAmount,
  statementDate,
  statementDuplicates,
} from "../lib/statement-import";
import type { RecordData } from "../lib/finance";
const row = (extra: any = {}): RecordData => ({
  id: "one",
  version: 1,
  status: "Active",
  date: "2026-11-02",
  account: "bank",
  type: "Expense",
  amount: 100,
  description: "Shop",
  ...extra,
});
test("billing cycles clamp short months and calculate billed, unbilled and overdue dues", () => {
  assert.deepEqual(
    billingCycle("2026-02-28", { statementDay: 31, dueDay: 15 }, "2026-03-01"),
    {
      start: "2026-02-01",
      close: "2026-02-28",
      due: "2026-03-15",
      status: "Billed",
    },
  );
  assert.equal(
    billingCycle("2026-11-02", { statementDay: 20, dueDay: 5 }, "2026-11-03")
      ?.status,
    "Unbilled",
  );
  assert.equal(
    billingCycle("2026-10-20", { statementDay: 20, dueDay: 5 }, "2026-11-06")
      ?.status,
    "Overdue",
  );
  assert.equal(billingCycle("2026-10-20", {}), null);
});
test("short-month due dates always follow statement closure", () => {
  assert.equal(
    billingCycle("2026-02-28", { statementDay: 31, dueDay: 30 }, "2026-03-01")
      ?.due,
    "2026-03-30",
  );
});
test("forecast amortizes to zero, handles zero interest and detects non-amortizing payments", () => {
  const plain = loanForecast(1200, 0, 100, 0, "2026-01-31");
  assert.equal(plain.months, 12);
  assert.equal(plain.interest, 0);
  assert.equal(plain.schedule[0].date, "2026-02-28");
  assert.equal(plain.schedule.at(-1)?.balance, 0);
  const base = loanForecast(100000, 8, 3000),
    extra = loanForecast(100000, 8, 3000, 1000);
  assert.ok(extra.interest < base.interest);
  assert.ok(extra.months < base.months);
  assert.match(loanForecast(100000, 12, 1000).error, /exceed/);
  assert.equal(loanForecast(100, 10, 10, 0, "2026-11-02", 100).months, 0);
  assert.throws(() => loanForecast(-1, 1, 1));
});
test("reconciliation respects statement cutoff and never counts deleted or deferred purchases", () => {
  const account = row({ id: "bank", openingBalance: 1000 });
  const rows = [
    row(),
    row({ id: "credit", expenseMode: "Credit", amount: 200 }),
    row({ id: "later", date: "2026-12-01" }),
    row({ id: "gone", status: "Deleted" }),
  ];
  assert.deepEqual(reconcile(account, rows, "2026-11-02", 950), {
    ledger: 900,
    statementBalance: 950,
    difference: 50,
  });
  assert.equal(rows.length, 4);
});
test("monthly budgets count card purchases once, loan interest only, and honor account and month scopes", () => {
  const rows = [
    row({ expenseMode: "Credit", amount: 200, tagId: "food" }),
    row({ id: "bill", type: "Transfer", creditPayment: true, amount: 200 }),
    row({ id: "loan", loanPayment: true, interestPaid: 20, principalPaid: 80 }),
    row({ id: "other", account: "other" }),
    row({ id: "old", date: "2026-10-01" }),
  ];
  assert.equal(monthlySpending(row(), rows, "2026-11", ["bank"]), 220);
  assert.equal(
    monthlySpending(row({ tagId: "food" }), rows, "2026-11", ["bank"]),
    200,
  );
});
test("CSV preview parses quoted fields, exact amounts, dates and intra-file/existing duplicates", () => {
  const parsed = parseCSV(
    '\uFEFFDate,Description,Amount\r\n02/11/2026,"A, B",100.01\r\n03/11/2026,"line\nwith ""quotes""",(20)',
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[1][1], "A, B");
  assert.equal(parsed[2][1], 'line\nwith "quotes"');
  assert.equal(statementDate("02/11/2026"), "2026-11-02");
  assert.equal(statementDate("02/11/2026", "MDY"), "2026-02-11");
  assert.throws(() => statementDate("31/02/2026"));
  assert.equal(statementAmount("₹1,23,456.78"), 123456.78);
  assert.equal(statementAmount("(20)"), -20);
  assert.throws(() => statementAmount("oops"));
  assert.deepEqual(
    statementDuplicates(
      [row(), row({ id: "two" }), row({ description: "Another" })],
      [],
    ),
    [false, true, false],
  );
  assert.deepEqual(statementDuplicates([row()], [row()]), [true]);
  assert.throws(() => parseCSV('a,b\n"unfinished'));
});
