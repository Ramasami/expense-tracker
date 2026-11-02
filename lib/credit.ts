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
export function creditRemaining(
  charge: RecordData,
  rows: RecordData[],
  excludingId?: string,
) {
  const paid = rows
    .filter(
      (row) =>
        row.id !== excludingId &&
        row.status === "Active" &&
        isCreditPayment(row) &&
        row.paidTransactionIds?.includes(charge.id),
    )
    .reduce(
      (sum, row) =>
        sum +
        Math.round(
          Number(
            row.creditAllocations
              ? row.creditAllocations[charge.id] || 0
              : charge.amount,
          ) * 100,
        ),
      0,
    );
  return Math.max(0, Math.round(Number(charge.amount) * 100) - paid) / 100;
}
export function unpaidCredit(
  rows: RecordData[],
  account?: string,
  includeUnknown = false,
): RecordData[] {
  return rows
    .filter(
      (row) =>
        row.status === "Active" &&
        isCredit(row) &&
        (includeUnknown || row.settlementStatus !== "Unknown") &&
        (!account || row.account === account),
    )
    .map((row) => ({
      ...row,
      originalAmount: row.amount,
      amount: creditRemaining(row, rows),
    }))
    .filter((row) => row.amount > 0);
}
/** Allocate a partial payment oldest-first; all amounts are stored in paise precision. */
export function allocateCredit(charges: RecordData[], amount: number) {
  let left = Math.round(amount * 100);
  const allocations: Record<string, number> = {};
  if (
    !Number.isFinite(amount) ||
    left <= 0 ||
    left > Math.round(creditTotal(charges) * 100)
  )
    throw Error(
      "Payment must be positive and no more than the selected outstanding amount.",
    );
  for (const charge of [...charges].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const paid = Math.min(left, Math.round(charge.amount * 100));
    if (paid > 0) allocations[charge.id] = paid / 100;
    left -= paid;
  }
  return allocations;
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
        creditRemaining(charge, rows, row.id) <= 0,
    )
  )
    throw Error(
      "A selected credit card transaction changed or was already paid. Refresh and review the unpaid list.",
    );
  if (
    charges.some(
      (charge) =>
        charge?.settlementStatus === "Unknown" &&
        !row.confirmedUnpaidTransactionIds?.includes(charge.id),
    )
  )
    throw Error(
      "Confirm that selected statement transactions with unknown settlement are unpaid.",
    );
  if (row.creditAllocations) {
    const allocations = row.creditAllocations;
    if (
      typeof allocations !== "object" ||
      Array.isArray(allocations) ||
      Object.keys(allocations).length !== ids.length ||
      Object.keys(allocations).some((id) => !ids.includes(id)) ||
      charges.some((charge) => {
        const amount = allocations[charge!.id];
        return (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          (Math.round(amount * 100) !== amount * 100 &&
            Math.abs(Math.round(amount * 100) - amount * 100) > 0.00001) ||
          Math.round(amount * 100) >
            Math.round(creditRemaining(charge!, rows, row.id) * 100)
        );
      }) ||
      Math.round(Number(row.amount) * 100) !==
        Object.values(allocations).reduce(
          (sum: number, n: any) => sum + Math.round(n * 100),
          0,
        )
    )
      throw Error(
        "Selected credit card amounts changed or payment allocation is invalid. Refresh and review the payment total.",
      );
  } else if (
    Math.round(Number(row.amount) * 100) !==
    Math.round(
      charges.reduce(
        (sum, charge) => sum + creditRemaining(charge!, rows, row.id),
        0,
      ) * 100,
    )
  )
    throw Error(
      "Selected credit card amounts changed. Refresh and review the payment total.",
    );
}
export function transactionDetails(row: RecordData) {
  return {
    statementImport: row.statementImport === true,
    sourceStatementId: row.sourceStatementId || "",
    importDuplicateConfirmed: row.importDuplicateConfirmed === true,
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
    creditAllocations:
      row.creditPayment === true ? row.creditAllocations || null : null,
    confirmedUnpaidTransactionIds:
      row.creditPayment === true ? row.confirmedUnpaidTransactionIds || [] : [],
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
