import type { RecordData } from "./finance";
export function isLoanPayment(row: RecordData) {
  return row.type === "Expense" && row.loanPayment === true;
}
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
export function loanSummary(
  loan: RecordData,
  rows: RecordData[],
  excludingId?: string,
) {
  const payments = rows.filter(
    (row) =>
      row.id !== excludingId &&
      row.status === "Active" &&
      isLoanPayment(row) &&
      row.loanId === loan.id,
  );
  const principalPaid =
    cents(loan.openingPrincipalPaid) +
    payments.reduce((sum, row) => sum + cents(row.principalPaid), 0);
  const interestPaid =
    cents(loan.openingInterestPaid) +
    payments.reduce((sum, row) => sum + cents(row.interestPaid), 0);
  return {
    principalPaid: principalPaid / 100,
    interestPaid: interestPaid / 100,
    remainingPrincipal: (cents(loan.principal) - principalPaid) / 100,
    totalPaid: (principalPaid + interestPaid) / 100,
  };
}
export function validateLoan(loan: RecordData, rows: RecordData[]) {
  for (const key of [
    "principal",
    "interestRate",
    "openingPrincipalPaid",
    "openingInterestPaid",
  ])
    if (!Number.isFinite(Number(loan[key] || 0)) || Number(loan[key] || 0) < 0)
      throw Error(
        "Loan amounts and interest rate must be valid non-negative numbers.",
      );
  if (
    Number(loan.principal || 0) <= 0 ||
    Number(loan.interestRate) > 1000 ||
    loanSummary(loan, rows).remainingPrincipal < 0
  )
    throw Error(
      "Loan principal must cover the principal already paid; check the principal and interest rate.",
    );
}
export function validateLoanPayment(
  row: RecordData,
  settings: RecordData[],
  rows: RecordData[],
) {
  const loan = settings.find(
    (loan) =>
      loan.id === row.loanId &&
      loan.kind === "loan" &&
      loan.status === "Active",
  );
  if (!loan || !isLoanPayment(row) || row.expenseMode === "Credit")
    throw Error("Choose an active loan and pay it as an immediate expense.");
  if (
    !Number.isFinite(row.principalPaid) ||
    !Number.isFinite(row.interestPaid) ||
    row.principalPaid < 0 ||
    row.interestPaid < 0 ||
    cents(row.principalPaid) + cents(row.interestPaid) <= 0 ||
    cents(row.amount) !== cents(row.principalPaid) + cents(row.interestPaid)
  )
    throw Error(
      "The repayment total must equal principal paid plus interest paid.",
    );
  if (
    cents(row.principalPaid) >
    cents(loanSummary(loan, rows, row.id).remainingPrincipal)
  )
    throw Error(
      "Principal payment exceeds the remaining loan balance. Refresh and review the repayment.",
    );
}
