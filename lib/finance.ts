import { isLoanPayment } from "./loans";
import { isCredit, isCreditPayment } from "./credit";
import { belongsToOwner } from "./owners";
export type RecordData = {
  id: string;
  version: number;
  status: string;
  [key: string]: any;
};
export type Snapshot = {
  transactions: RecordData[];
  tags: RecordData[];
  accounts: RecordData[];
  budgets: RecordData[];
  goals: RecordData[];
  recurring: RecordData[];
  holdings: RecordData[];
  settings: RecordData[];
  audit: RecordData[];
};
export const empty: Snapshot = {
  transactions: [],
  tags: [],
  accounts: [],
  budgets: [],
  goals: [],
  recurring: [],
  holdings: [],
  settings: [],
  audit: [],
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
export function totals(rows: RecordData[]) {
  let income = 0,
    expense = 0,
    investment = 0;
  for (const r of rows.filter((r) => r.status !== "Deleted")) {
    const n = Number(r.amount) || 0;
    if (r.type === "Income") income += n;
    if (isLoanPayment(r)) expense += Number(r.interestPaid) || 0;
    else if ((r.type === "Expense" && !isCredit(r)) || isCreditPayment(r))
      expense += n;
    if (r.type === "Investment") investment += n;
  }
  return {
    income,
    expense,
    investment,
    net:
      income -
      expense -
      investment -
      rows
        .filter((row) => row.status !== "Deleted" && isLoanPayment(row))
        .reduce((sum, row) => sum + Number(row.principalPaid || 0), 0),
    savings: income ? (100 * (income - expense)) / income : 0,
  };
}
export function balance(account: RecordData, rows: RecordData[]) {
  return (
    Number(account.openingBalance || 0) +
    rows
      .filter((r) => r.status !== "Deleted")
      .reduce(
        (sum, r) =>
          sum +
          (r.account === account.id && !isCredit(r)
            ? r.type === "Income"
              ? Number(r.amount)
              : -Number(r.amount)
            : 0) +
          (r.type === "Transfer" &&
          !isCreditPayment(r) &&
          r.toAccount === account.id
            ? Number(r.amount)
            : 0),
        0,
      )
  );
}
export function dateRange(label: string, now = new Date()): [string, string] {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = day(now);
  const d = new Date(today + "T12:00:00Z");
  let start = new Date(d),
    end = new Date(d);
  const y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (label === "All Time") return ["1900-01-01", "2999-12-31"];
  if (label === "Yesterday") {
    start.setUTCDate(d.getUTCDate() - 1);
    end = new Date(start);
  } else if (label === "This Week")
    start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  else if (label.startsWith("Last ") && label.includes("Days"))
    start.setUTCDate(d.getUTCDate() - Number(label.split(" ")[1]) + 1);
  else if (label === "This Month") start = new Date(Date.UTC(y, m, 1, 12));
  else if (label === "Last Month") {
    start = new Date(Date.UTC(y, m - 1, 1, 12));
    end = new Date(Date.UTC(y, m, 0, 12));
  } else if (label === "YTD" || label === "This Year")
    start = new Date(Date.UTC(y, 0, 1, 12));
  else if (label === "This Financial Year")
    start = new Date(Date.UTC(m < 3 ? y - 1 : y, 3, 1, 12));
  else if (label === "Last 12 Months")
    start = new Date(Date.UTC(y, m - 11, 1, 12));
  return [day(start), day(end)];
}
export function filterRows(
  rows: RecordData[],
  person: string,
  start: string,
  end: string,
  accounts?: RecordData[],
  owners?: RecordData[],
) {
  return rows.filter(
    (r) =>
      r.date >= start &&
      r.date <= end &&
      (accounts && owners
        ? belongsToOwner(r, person, accounts, owners)
        : person === "Combined" || r.person === person),
  );
}
export function csv(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const q = (v: unknown) => {
    let s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    keys.map(q).join(","),
    ...rows.map((r) => keys.map((k) => q(r[k])).join(",")),
  ].join("\r\n");
}
