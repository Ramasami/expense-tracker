import { balance, RecordData } from "./finance";
import { isCreditPayment } from "./credit";
import { isLoanPayment } from "./loans";
export const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function monthDay(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const max = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(max, Math.max(1, day))).padStart(2, "0")}`;
}
export function nextMonth(month: string, offset = 1) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function billingCycle(date: string, card: any, today = todayIST()) {
  if (
    !Number.isInteger(Number(card?.statementDay)) ||
    Number(card.statementDay) < 1 ||
    Number(card.statementDay) > 31
  )
    return null;
  const month = date.slice(0, 7),
    day = Number(card.statementDay);
  const close =
    date <= monthDay(month, day)
      ? monthDay(month, day)
      : monthDay(nextMonth(month), day);
  const previous = monthDay(nextMonth(close.slice(0, 7), -1), day);
  const start = new Date(Date.parse(previous + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const dueDay = Number(card.dueDay);
  const candidate =
    Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31
      ? monthDay(close.slice(0, 7), dueDay)
      : "";
  const due = candidate
    ? candidate > close
      ? candidate
      : monthDay(nextMonth(close.slice(0, 7)), dueDay)
    : "";
  return {
    start,
    close,
    due,
    status:
      close > today ? "Unbilled" : due && due < today ? "Overdue" : "Billed",
  };
}
export function reconcile(
  account: RecordData,
  rows: RecordData[],
  asOf: string,
  statementBalance: number,
) {
  const included = rows.filter(
    (row) => row.date <= asOf && row.status === "Active",
  );
  const ledger = Math.round(balance(account, included) * 100) / 100;
  return {
    ledger,
    statementBalance,
    difference: Math.round((statementBalance - ledger) * 100) / 100,
  };
}
export function budgetTagIds(budget: Partial<RecordData>): string[] {
  return Array.isArray(budget.tagIds)
    ? budget.tagIds
    : budget.tagId
      ? [budget.tagId]
      : [];
}
export function monthlySpending(
  budget: RecordData,
  rows: RecordData[],
  month: string,
  allowedAccounts?: string[],
) {
  return (
    Math.round(
      rows
        .filter(
          (row) =>
            row.status === "Active" &&
            row.type === "Expense" &&
            !isCreditPayment(row) &&
            String(row.date).startsWith(month) &&
            (!budget.accountId || row.account === budget.accountId) &&
            (!allowedAccounts || allowedAccounts.includes(row.account)) &&
            (!budgetTagIds(budget).length ||
              budgetTagIds(budget).includes(row.tagId)) &&
            (allowedAccounts ||
              !budget.person ||
              budget.person === "Combined" ||
              row.person === budget.person),
        )
        .reduce(
          (sum, row) =>
            sum + Number(isLoanPayment(row) ? row.interestPaid : row.amount),
          0,
        ) * 100,
    ) / 100
  );
}
export function loanForecast(
  principal: number,
  annualRate: number,
  payment: number,
  extra = 0,
  start = todayIST(),
  lumpSum = 0,
) {
  if (
    [principal, annualRate, payment, extra, lumpSum].some(
      (x) => !Number.isFinite(x) || x < 0,
    )
  )
    throw Error("Enter valid non-negative forecast amounts.");
  let remaining = Math.round(Math.max(0, principal - lumpSum) * 100),
    interestTotal = 0;
  const schedule: {
    date: string;
    payment: number;
    principal: number;
    interest: number;
    balance: number;
  }[] = [];
  const monthly = annualRate / 1200,
    amount = Math.round((payment + extra) * 100);
  if (remaining && (!amount || amount <= Math.round(remaining * monthly)))
    return {
      schedule,
      months: 0,
      interest: 0,
      payoff: "",
      error: "Monthly payment must exceed monthly interest to repay this loan.",
    };
  for (let i = 0; remaining > 0 && i < 1200; i++) {
    const interest = Math.round(remaining * monthly),
      paid = Math.min(amount, remaining + interest),
      principalPaid = paid - interest;
    remaining -= principalPaid;
    interestTotal += interest;
    const date = monthDay(
      nextMonth(start.slice(0, 7), i + 1),
      Number(start.slice(8)),
    );
    schedule.push({
      date,
      payment: paid / 100,
      principal: principalPaid / 100,
      interest: interest / 100,
      balance: remaining / 100,
    });
  }
  return {
    schedule,
    months: schedule.length,
    interest: interestTotal / 100,
    payoff: schedule.at(-1)?.date || start,
    error: remaining ? "Payoff exceeds the 100-year forecast limit." : "",
  };
}
