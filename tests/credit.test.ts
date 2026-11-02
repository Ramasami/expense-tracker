import { test } from "node:test";
import assert from "node:assert/strict";
import { freshState, applyOperation } from "../lib/local-store";
import {
  unpaidCredit,
  creditTotal,
  validateCreditPayment,
} from "../lib/credit";
import { balance, totals } from "../lib/finance";
const op = (record: any, action = "create", entity = "transactions") => ({
  record,
  action,
  entity,
  operationId: crypto.randomUUID(),
  actor: "Ram",
});
function sample() {
  const state = freshState();
  state.data.accounts = [
    {
      id: "card-account",
      name: "Ram HDFC",
      ownerIds: ["owner-ram"],
      creditCards: [
        { id: "visa", name: "Visa" },
        { id: "amex", name: "Amex" },
      ],
      openingBalance: 1000,
      status: "Active",
      version: 1,
    },
    {
      id: "payer",
      name: "Varsha HDFC",
      ownerIds: ["owner-varsha"],
      openingBalance: 2000,
      status: "Active",
      version: 1,
    },
  ];
  return state;
}
const charge = (amount = 100) => ({
  date: "2026-11-02",
  description: "Credit purchase",
  account: "card-account",
  type: "Expense",
  expenseMode: "Credit",
  creditCardId: "visa",
  tagId: "default-tag-0",
  amount,
});
function owed() {
  let state = sample();
  const a = applyOperation(state, op(charge(100)));
  const b = applyOperation(
    a.state,
    op({ ...charge(250), description: "Other card", creditCardId: "amex" }),
  );
  return { state: b.state, first: a.result.record, second: b.result.record };
}
const payment = (ids: string[], amount: number) => ({
  date: "2026-11-02",
  description: "Credit bill",
  type: "Transfer",
  creditPayment: true,
  account: "payer",
  toAccount: "card-account",
  paidTransactionIds: ids,
  amount,
  tagId: "default-tag-16",
});
test("credit stays unpaid without reducing cash; cross-owner payment settles selected items once", () => {
  const { state, first, second } = owed();
  assert.equal(creditTotal(unpaidCredit(state.data.transactions)), 350);
  assert.equal(balance(state.data.accounts[0], state.data.transactions), 1000);
  assert.equal(totals(state.data.transactions).expense, 0);
  const request = op(payment([first.id], 100));
  const paid = applyOperation(state, request);
  assert.deepEqual(
    unpaidCredit(paid.state.data.transactions).map((row) => row.id),
    [second.id],
  );
  assert.equal(
    balance(paid.state.data.accounts[1], paid.state.data.transactions),
    1900,
  );
  assert.equal(
    balance(paid.state.data.accounts[0], paid.state.data.transactions),
    1000,
  );
  assert.equal(totals(paid.state.data.transactions).expense, 100);
  assert.equal(
    applyOperation(paid.state, request).state.data.transactions.length,
    3,
  );
  assert.throws(
    () => applyOperation(paid.state, op(payment([first.id], 100))),
    /already paid/,
  );
  const reversed = applyOperation(paid.state, op(paid.result.record, "delete"));
  assert.equal(unpaidCredit(reversed.state.data.transactions).length, 2);
  assert.equal(
    balance(reversed.state.data.accounts[1], reversed.state.data.transactions),
    2000,
  );
});
test("settlements reject empty, duplicate, foreign-account and changed amounts", () => {
  const { state, first, second } = owed();
  for (const bad of [
    payment([], 0),
    payment([first.id, first.id], 200),
    payment([first.id], 999),
    { ...payment([first.id], 100), toAccount: "payer" },
  ])
    assert.throws(() =>
      validateCreditPayment(
        { ...bad, id: "new", status: "Active", version: 1 },
        state.data.transactions,
      ),
    );
  const paid = applyOperation(state, op(payment([first.id, second.id], 350)));
  assert.equal(unpaidCredit(paid.state.data.transactions).length, 0);
  assert.throws(
    () =>
      applyOperation(
        paid.state,
        op({ ...paid.state.data.transactions[0], amount: 500 }, "edit"),
      ),
    /Delete its bill payment/,
  );
  assert.throws(
    () =>
      applyOperation(paid.state, op(paid.state.data.transactions[0], "delete")),
    /Delete its bill payment/,
  );
});
test("cards are account-specific, uniquely named and cannot be removed while unpaid", () => {
  const state = sample();
  assert.throws(
    () => applyOperation(state, op({ ...charge(), creditCardId: "unknown" })),
    /Choose a credit card/,
  );
  const { state: withCharge } = applyOperation(state, op(charge()));
  assert.throws(
    () =>
      applyOperation(
        withCharge,
        op(
          { ...withCharge.data.accounts[0], creditCards: [] },
          "edit",
          "accounts",
        ),
      ),
    /outstanding credit/,
  );
  assert.throws(
    () =>
      applyOperation(
        state,
        op(
          {
            ...state.data.accounts[0],
            creditCards: [
              { id: "1", name: "Visa" },
              { id: "2", name: "visa" },
            ],
          },
          "edit",
          "accounts",
        ),
      ),
    /unique names/,
  );
});

test("paid card history keeps supporting receipts after card configuration is removed", () => {
  const { state, first, second } = owed();
  const paid = applyOperation(state, op(payment([first.id, second.id], 350)));
  const removed = applyOperation(
    paid.state,
    op({ ...paid.state.data.accounts[0], creditCards: [] }, "edit", "accounts"),
  );
  const historical = removed.state.data.transactions.find(
    (row) => row.id === first.id,
  )!;
  const updated = applyOperation(
    removed.state,
    op(
      { ...historical, receipts: [{ id: "receipt", name: "bill.pdf" }] },
      "edit",
    ),
  );
  assert.equal(updated.result.record.creditCardName, "Visa");
  assert.equal(updated.result.record.receipts.length, 1);
});

test("partial statement history does not invent unpaid status or turn card refunds into bank income", () => {
  const rows = [
    {
      id: "old-charge",
      type: "Expense",
      expenseMode: "Credit",
      settlementStatus: "Unknown",
      amount: 500,
      account: "bank",
      version: 1,
      status: "Active",
    },
    {
      id: "refund",
      type: "Income",
      cardRefund: true,
      amount: 100,
      account: "bank",
      version: 1,
      status: "Active",
    },
    {
      id: "bill",
      type: "Expense",
      statementCardPayment: true,
      amount: 250,
      account: "bank",
      version: 1,
      status: "Active",
    },
  ];
  assert.equal(unpaidCredit(rows).length, 0);
  assert.equal(totals(rows).income, 0);
  assert.equal(totals(rows).expense, 250);
  assert.equal(
    balance(
      { id: "bank", version: 1, status: "Active", openingBalance: 1000 },
      rows,
    ),
    750,
  );
});
