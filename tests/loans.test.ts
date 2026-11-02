import { test } from "node:test";
import assert from "node:assert/strict";
import { freshState, applyOperation } from "../lib/local-store";
import { loanSummary } from "../lib/loans";
import { balance, totals } from "../lib/finance";
const op = (entity: string, record: any, action = "create") => ({
  entity,
  record,
  action,
  operationId: crypto.randomUUID(),
  actor: "Ram",
});
function sample() {
  const state = freshState();
  state.data.accounts = [
    {
      id: "bank",
      name: "Bank",
      ownerIds: ["owner-ram"],
      openingBalance: 2000,
      status: "Active",
      version: 1,
    },
  ];
  return applyOperation(
    state,
    op("settings", {
      kind: "loan",
      name: "Home loan",
      accountId: "bank",
      principal: 10000,
      interestRate: 8.5,
      openingPrincipalPaid: 2500,
      openingInterestPaid: 500,
    }),
  );
}
const repayment = (
  loanId: string,
  principalPaid = 500,
  interestPaid = 100,
) => ({
  loanId,
  loanPayment: true,
  type: "Expense",
  expenseMode: "Debit",
  account: "bank",
  date: "2026-11-02",
  description: "Loan repayment",
  principalPaid,
  interestPaid,
  amount: principalPaid + interestPaid,
  tagId: "default-tag-0",
});
test("loan opening totals and repayments reduce principal; only interest counts as expense", () => {
  const { state, result: loan } = sample();
  assert.equal(
    loanSummary(loan.record, state.data.transactions).remainingPrincipal,
    7500,
  );
  const request = op("transactions", repayment(loan.record.id));
  const paid = applyOperation(state, request);
  assert.deepEqual(loanSummary(loan.record, paid.state.data.transactions), {
    principalPaid: 3000,
    interestPaid: 600,
    remainingPrincipal: 7000,
    totalPaid: 3600,
  });
  assert.equal(
    balance(state.data.accounts[0], paid.state.data.transactions),
    1400,
  );
  assert.equal(totals(paid.state.data.transactions).expense, 100);
  assert.equal(totals(paid.state.data.transactions).net, -600);
  assert.equal(
    applyOperation(paid.state, request).state.data.transactions.length,
    1,
  );
  const deleted = applyOperation(
    paid.state,
    op("transactions", paid.result.record, "delete"),
  );
  assert.equal(
    loanSummary(loan.record, deleted.state.data.transactions)
      .remainingPrincipal,
    7500,
  );
});
test("loan payments reject overpayment, invalid splits and edits that break the link", () => {
  const { state, result } = sample();
  for (const record of [
    repayment(result.record.id, 8000, 10),
    { ...repayment(result.record.id), amount: 1 },
    repayment("unknown"),
    repayment(result.record.id, -1, 100),
  ])
    assert.throws(() => applyOperation(state, op("transactions", record)));
  const paid = applyOperation(
    state,
    op("transactions", repayment(result.record.id)),
  );
  assert.throws(
    () =>
      applyOperation(
        paid.state,
        op(
          "transactions",
          { ...paid.result.record, principalPaid: 200, interestPaid: 400 },
          "edit",
        ),
      ),
    /existing loan payment/,
  );
  assert.throws(
    () =>
      applyOperation(
        paid.state,
        op("settings", { ...result.record, principal: 2000 }, "edit"),
      ),
    /already paid/,
  );
});
