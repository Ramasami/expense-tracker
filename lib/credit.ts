import type { RecordData } from "./finance";
export function isCredit(row: RecordData) {
  return row.type === "Expense" && row.expenseMode === "Credit";
}
export function isCreditPayment(row: RecordData) {
  return (
    (row.type === "Transfer" && row.creditPayment === true) ||
    row.statementCardPayment === true
  );
}
export function paymentFor(
  id: string,
  rows: RecordData[],
  excludingId?: string,
) {
  return rows.find(
    (row) =>
      row.id !== excludingId &&
      row.status === "Active" &&
      isCreditPayment(row) &&
      Array.isArray(row.paidTransactionIds) &&
      row.paidTransactionIds.includes(id),
  );
}
export function unpaidCredit(rows: RecordData[], account?: string) {
  const paid = new Set(
    rows
      .filter((row) => row.status === "Active" && isCreditPayment(row))
      .flatMap((row) =>
        Array.isArray(row.paidTransactionIds) ? row.paidTransactionIds : [],
      ),
  );
  return rows.filter(
    (row) =>
      row.status === "Active" &&
      isCredit(row) &&
      row.settlementStatus !== "Unknown" &&
      (!account || row.account === account) &&
      !paid.has(row.id),
  );
}
export function creditTotal(rows: RecordData[]) {
  return (
    rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) /
    100
  );
}
/** Validate the complete settlement against a fresh Sheet snapshot before committing it. */
export function validateCreditPayment(row: RecordData, rows: RecordData[]) {
  if (!isCreditPayment(row))
    throw Error("A credit card bill payment must be a transfer.");
  const ids = row.paidTransactionIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw Error("Select at least one unpaid credit card transaction.");
  const charges = ids.map((id: string) =>
    rows.find((charge) => charge.id === id),
  );
  if (
    charges.some(
      (charge) =>
        !charge ||
        charge.status !== "Active" ||
        !isCredit(charge) ||
        charge.account !== row.toAccount ||
        paymentFor(charge.id, rows, row.id),
    )
  )
    throw Error(
      "A selected credit card transaction changed or was already paid. Refresh and review the unpaid list.",
    );
  if (
    Math.round(Number(row.amount) * 100) !==
    Math.round(creditTotal(charges as RecordData[]) * 100)
  )
    throw Error(
      "Selected credit card amounts changed. Refresh and review the payment total.",
    );
}
export function transactionDetails(row: RecordData) {
  return {
    statementImport: row.statementImport === true,
    sourceStatementId: row.sourceStatementId || "",
    settlementStatus: row.settlementStatus || "",
    cardRefund: row.cardRefund === true,
    statementCardPayment: row.statementCardPayment === true,
    statementCardAccountId: row.statementCardAccountId || "",
    allocationInferred: row.allocationInferred === true,
    expenseMode:
      row.type === "Expense" && row.expenseMode === "Credit"
        ? "Credit"
        : "Debit",
    creditCardId: row.creditCardId || "",
    creditCardName: row.creditCardName || "",
    loanPayment: row.loanPayment === true,
    loanId: row.loanId || "",
    principalPaid: row.loanPayment === true ? Number(row.principalPaid) : 0,
    interestPaid: row.loanPayment === true ? Number(row.interestPaid) : 0,
    creditPayment: row.creditPayment === true,
    paidTransactionIds:
      row.creditPayment === true ? row.paidTransactionIds || [] : [],
  };
}

export function reportedCardTotal(accounts: RecordData[]) {
  return (
    accounts
      .filter((account) => account.status === "Active")
      .reduce(
        (sum, account) =>
          sum +
          (account.creditCards || []).reduce(
            (total: number, card: any) =>
              total +
              Math.round(
                Number(card.statementSnapshot?.reportedBalance || 0) * 100,
              ),
            0,
          ),
        0,
      ) / 100
  );
}
