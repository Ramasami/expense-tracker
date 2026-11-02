"use client";
import { isLoanPayment } from "../lib/loans";
import { isCredit, isCreditPayment } from "../lib/credit";
import { RecordData, money, totals } from "../lib/finance";
import { group, classifyExpenses, spendingComparison } from "../lib/reports";
export default function Analytics({
  rows,
  tags,
  history,
  range,
  onDrill,
}: {
  rows: RecordData[];
  tags: RecordData[];
  history: RecordData[];
  range: [string, string];
  onDrill: (tag: string, date?: string) => void;
}) {
  const expenses = classifyExpenses(
    rows.filter(
      (r) => (r.type === "Expense" && !isCredit(r)) || isCreditPayment(r),
    ),
    tags,
  );
  const days = group(expenses, "date").sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const weeks = group(
    expenses.map((r) => {
      const d = new Date(r.date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return { ...r, week: d.toISOString().slice(0, 10) };
    }),
    "week",
  );
  const spendingAmount = (row: RecordData) =>
    Number(isLoanPayment(row) ? row.interestPaid : row.amount);
  const average = expenses.length
    ? expenses.reduce((s, r) => s + spendingAmount(r), 0) / expenses.length
    : 0;
  const unusuallyLarge = expenses
    .filter((r) => spendingAmount(r) > average * 2 && expenses.length > 2)
    .sort((a, b) => spendingAmount(b) - spendingAmount(a));
  const max = Math.max(1, ...days.map((d) => d.expense));
  const grouped = (label: string, field: string) => (
    <section className="card">
      <div className="card-heading">
        <h2>{label}</h2>
      </div>
      <div className="breakdown">
        {group(expenses, field)
          .slice(0, 10)
          .map((g) => (
            <div className="analysis-row" key={g.name}>
              <span>{g.name}</span>
              <b>{money(g.expense)}</b>
            </div>
          ))}
        {!expenses.length && <p>No expenses in this period.</p>}
      </div>
    </section>
  );
  const now = new Date(),
    month = now.toISOString().slice(0, 7),
    monthSpend = expenses
      .filter((r) => r.date.startsWith(month))
      .reduce((s, r) => s + spendingAmount(r), 0);
  const projection =
    (monthSpend / now.getDate()) *
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (
    <>
      <div className="section-heading">
        <h2>A closer look at spending</h2>
      </div>
      <div className="entity-grid">
        {grouped("Top 10 categories", "tag")}
        {grouped("Merchant rankings", "description")}
        {grouped("Payment methods", "payment")}
        {grouped("Ram vs Varsha", "person")}
        {grouped("Parent categories", "parentCategory")}
        {grouped("Fixed vs variable", "spendingKind")}
        <section className="card insight">
          <h2>Period comparisons</h2>
          <p>Selected period: {money(totals(expenses).expense)}.</p>
          {[-1, -12].map((months) => {
            const previous = spendingComparison(history, range, months),
              current = totals(expenses).expense;
            return (
              <p key={months}>
                {months === -1 ? "One month earlier" : "One year earlier"}:{" "}
                {money(previous)} ·{" "}
                {previous
                  ? `${(((current - previous) / previous) * 100).toFixed(1)}% change`
                  : "No comparable spending recorded"}
                . Uses the selected date window shifted by {Math.abs(months)}{" "}
                month(s).
              </p>
            );
          })}
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>Weekly spending</h2>
          </div>
          <div className="breakdown">
            {weeks.map((w) => (
              <div className="analysis-row" key={w.name}>
                <span>Week of {w.name}</span>
                <b>{money(w.expense)}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="card insight">
          <h2>Unusually large transactions</h2>
          <p>
            Transactions over twice the mean expense ({money(average)}), when
            there are at least three expenses.
          </p>
          {unusuallyLarge.slice(0, 5).map((r) => (
            <p key={r.id}>
              {r.description} · {money(r.amount)}
            </p>
          ))}
          {!unusuallyLarge.length && <p>No expenses meet this threshold.</p>}
          <p>
            Projected current-month spending: {money(projection)}. Based on
            selected records dated this month, extrapolated by elapsed calendar
            days.
          </p>
        </section>
      </div>
      <section className="card heatmap">
        <div className="card-heading">
          <div>
            <h2>Your spending calendar</h2>
            <p>Daily spending intensity · hover for amounts</p>
          </div>
        </div>
        <div className="heatmap-cells">
          {days.map((d) => (
            <button
              key={d.name}
              title={`${d.name}: ${money(d.expense)}`}
              style={{
                background: `rgba(255,56,92,${0.1 + (0.9 * d.expense) / max})`,
              }}
              onClick={() => onDrill("", d.name)}
              aria-label={`${d.name}, ${money(d.expense)}`}
            >
              {d.name.slice(8)}
            </button>
          ))}
        </div>
        {!days.length && (
          <div className="empty">No spending days in this period.</div>
        )}
      </section>
    </>
  );
}
