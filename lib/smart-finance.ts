import { balance, type RecordData } from "./finance";
import { isCredit, isCreditPayment, unpaidCredit } from "./credit";
import { isLoanPayment } from "./loans";

const cents = (n: unknown) => Math.round(Number(n) * 100);
const day = (s: string) => Date.parse(s + "T12:00:00Z");
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
const DAY = 86400000;
const round = (n: number) => Math.round(n * 100) / 100;
export function merchantKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(
      (s) =>
        s &&
        !/^\d+$/.test(s) &&
        ![
          "upi",
          "pos",
          "payment",
          "purchase",
          "ref",
          "txn",
          "transfer",
          "neft",
          "imps",
        ].includes(s),
    )
    .join(" ")
    .trim();
}
const reference = (r: Partial<RecordData>) =>
  String(r.bankReference || r.reference || "")
    .trim()
    .toLowerCase();
export function duplicateReason(
  a: Partial<RecordData>,
  b: Partial<RecordData>,
) {
  if (a.id && a.id === b.id) return "";
  if (
    a.status === "Deleted" ||
    b.status === "Deleted" ||
    !a.account ||
    a.account !== b.account ||
    a.type !== b.type ||
    !Number.isFinite(Number(a.amount)) ||
    cents(a.amount) <= 0 ||
    cents(a.amount) !== cents(b.amount)
  )
    return "";
  // A card purchase, bank debit, repayment and refund are different financial events.
  if (
    (a.expenseMode || "Debit") !== (b.expenseMode || "Debit") ||
    (a.creditCardId || "") !== (b.creditCardId || "") ||
    !!a.cardRefund !== !!b.cardRefund ||
    isCreditPayment(a as RecordData) !== isCreditPayment(b as RecordData) ||
    isLoanPayment(a as RecordData) !== isLoanPayment(b as RecordData) ||
    (a.toAccount || "") !== (b.toAccount || "") ||
    (a.currency || "INR") !== (b.currency || "INR")
  )
    return "";
  const gap = Math.abs(day(a.date) - day(b.date)) / DAY;
  if (!Number.isFinite(gap) || gap > 2) return "";
  if (reference(a) && reference(b))
    return reference(a) === reference(b)
      ? "Same reference, account and amount"
      : "";
  const x = merchantKey(a.description),
    y = merchantKey(b.description);
  if (x.length < 3 || y.length < 3) return "";
  if (x === y)
    return gap === 0
      ? "Same merchant, date and amount"
      : "Same merchant and amount within two days";
  const xs = new Set(x.split(" ")),
    ys = new Set(y.split(" "));
  const shared = [...xs].filter((s) => ys.has(s)).length;
  return shared >= 2 && shared / new Set([...xs, ...ys]).size >= 0.6
    ? "Similar merchant and same amount within two days"
    : "";
}
export function duplicateMatches(
  row: Partial<RecordData>,
  existing: RecordData[],
) {
  return existing
    .map((record) => ({ record, reason: duplicateReason(row, record) }))
    .filter((m) => m.reason);
}
export function duplicatePairs(rows: RecordData[], limit = 50) {
  const buckets = new Map<string, RecordData[]>();
  const pairs: { first: RecordData; second: RecordData; reason: string }[] = [];
  for (const row of rows
    .filter((r) => r.status === "Active")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const key = `${row.account}|${row.type}|${cents(row.amount)}`;
    const recent = (buckets.get(key) || []).filter(
      (r) => day(row.date) - day(r.date) <= 2 * DAY,
    );
    for (const other of recent) {
      const reason = duplicateReason(row, other);
      if (reason) pairs.push({ first: other, second: row, reason });
      if (pairs.length >= limit) return pairs;
    }
    buckets.set(key, [...recent, row]);
  }
  return pairs;
}
export function suggestCategory(
  row: Partial<RecordData>,
  history: RecordData[],
  tags: RecordData[],
) {
  const merchant = merchantKey(row.description);
  if (
    merchant.length < 3 ||
    !row.account ||
    !row.type ||
    isCreditPayment(row as RecordData) ||
    isLoanPayment(row as RecordData)
  )
    return null;
  const valid = new Set(
    tags
      .filter((t) => t.status === "Active" && t.type === row.type)
      .map((t) => t.id),
  );
  const matches = history
    .filter(
      (r) =>
        r.status === "Active" &&
        r.id !== row.id &&
        r.account === row.account &&
        r.type === row.type &&
        !!r.cardRefund === !!row.cardRefund &&
        !isCreditPayment(r) &&
        !isLoanPayment(r) &&
        merchantKey(r.description) === merchant &&
        valid.has(r.tagId),
    )
    .sort((a, b) =>
      String(b.updatedAt || b.date).localeCompare(
        String(a.updatedAt || a.date),
      ),
    )
    .slice(0, 12);
  if (!matches.length) return null;
  // Latest confirmed correction wins only when recent choices agree; conflicts remain manual.
  const latest = matches[0].tagId;
  const recent = matches.slice(0, 3);
  if (recent.some((r) => r.tagId !== latest)) return null;
  return {
    tagId: latest as string,
    name: tags.find((t) => t.id === latest)!.name as string,
    count: matches.filter((r) => r.tagId === latest).length,
    confidence: matches.length >= 3 ? "Strong match" : "Suggested",
  };
}
export type CashAssumptions = {
  monthlyIncome: number;
  monthlyOutflow: number;
  adjustment: number;
  adjustmentDay: number;
  days: number;
};
export function cashForecast(
  accounts: RecordData[],
  rows: RecordData[],
  asOf: string,
  scenario?: Partial<CashAssumptions>,
) {
  if (!Number.isFinite(day(asOf))) throw Error("Choose a valid forecast date.");
  const ids = new Set(accounts.map((a) => a.id));
  const active = rows.filter((r) => r.status === "Active");
  const relevant = active.filter(
    (r) =>
      ids.has(r.account) || (r.type === "Transfer" && ids.has(r.toAccount)),
  );
  if (
    accounts.some((a) => !Number.isFinite(Number(a.openingBalance || 0))) ||
    relevant.some(
      (r) =>
        !Number.isFinite(day(r.date)) ||
        !Number.isSafeInteger(cents(r.amount)) ||
        Number(r.amount) < 0,
    )
  )
    throw Error(
      "Correct invalid account balances, dates or transaction amounts before forecasting.",
    );
  const past = active.filter((r) => r.date <= asOf);
  const start = day(asOf) - 89 * DAY;
  const sample = past.filter(
    (r) =>
      ids.has(r.account) &&
      day(r.date) >= start &&
      (r.type !== "Transfer" || isCreditPayment(r)) &&
      !isCredit(r) &&
      !r.cardRefund,
  );
  const oldest = sample
    .map((r) => day(r.date))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const observedDays =
    oldest === undefined
      ? 0
      : Math.min(90, Math.floor((day(asOf) - oldest) / DAY) + 1);
  const divisor = Math.max(30, observedDays); // Never extrapolate one busy day as an entire month.
  const income = sample
    .filter((r) => r.type === "Income" && !r.cardRefund)
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const outflow = sample
    .filter(
      (r) =>
        !isCredit(r) &&
        !r.cardRefund &&
        (r.type === "Expense" || r.type === "Investment" || isCreditPayment(r)),
    )
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const assumptions: CashAssumptions = {
    monthlyIncome: round((income * 30) / divisor),
    monthlyOutflow: round((outflow * 30) / divisor),
    adjustment: 0,
    adjustmentDay: 1,
    days: 90,
    ...scenario,
  };
  if (
    Object.values(assumptions).some((n) => !Number.isFinite(n)) ||
    assumptions.monthlyIncome < 0 ||
    assumptions.monthlyOutflow < 0 ||
    !Number.isInteger(assumptions.days) ||
    assumptions.days < 1 ||
    assumptions.days > 365 ||
    !Number.isInteger(assumptions.adjustmentDay) ||
    assumptions.adjustmentDay < 1 ||
    assumptions.adjustmentDay > assumptions.days
  )
    throw Error("Enter valid forecast amounts and dates.");
  const opening = round(accounts.reduce((s, a) => s + balance(a, past), 0));
  const net = (assumptions.monthlyIncome - assumptions.monthlyOutflow) / 30;
  const points = Array.from({ length: assumptions.days + 1 }, (_, i) => ({
    date: iso(day(asOf) + i * DAY),
    balance: round(
      opening +
        net * i +
        (i >= assumptions.adjustmentDay ? assumptions.adjustment : 0),
    ),
  }));
  const knownUnpaid = unpaidCredit(past, undefined, true)
    .filter((r) => ids.has(r.account))
    .reduce((s, r) => s + Number(r.amount), 0);
  return {
    opening,
    assumptions,
    observedDays,
    sampleCount: sample.length,
    points,
    end: points.at(-1)!.balance,
    low: Math.min(...points.map((p) => p.balance)),
    shortfall: points.find((p) => p.balance < 0)?.date || "",
    knownUnpaid: round(knownUnpaid),
    futureRecorded: active.filter((r) => ids.has(r.account) && r.date > asOf)
      .length,
  };
}
