import { belongsToOwner } from "./owners";
import { RecordData, totals } from "./finance";
export function group(rows: RecordData[], field: string) {
  const groups: Record<string, RecordData[]> = {};
  for (const r of rows) {
    const key = String(r[field] || "Unassigned");
    (groups[key] ||= []).push(r);
  }
  return Object.entries(groups)
    .map(([name, records]) => ({
      name,
      count: records.length,
      ...totals(records),
    }))
    .sort((a, b) => b.expense - a.expense);
}
export function report(
  title: string,
  rows: RecordData[],
  audit: RecordData[],
  accounts?: RecordData[],
  owners?: RecordData[],
) {
  switch (title) {
    case "Audit History Report":
      return audit;
    case "Category Expense Report":
    case "Tag Report":
      return group(
        rows.filter((r) => r.type === "Expense"),
        "tag",
      );
    case "Merchant Report":
      return group(rows, "description");
    case "Investment Contribution Report":
      return group(
        rows.filter((r) => r.type === "Investment"),
        "tag",
      ).map((g) => ({
        category: g.name,
        transactions: g.count,
        contributions: g.investment,
      }));
    case "Ram vs Varsha Report":
    case "Owner Comparison Report":
      return accounts && owners
        ? owners
            .filter((owner) => owner.status === "Active")
            .map((owner) => {
              const matched = rows.filter((row) =>
                belongsToOwner(row, owner.name, accounts, owners),
              );
              return {
                name: owner.name,
                count: matched.length,
                ...totals(matched),
              };
            })
        : group(rows, "person");
    case "Account Statement":
      return rows
        .filter((r) => r.account)
        .map((r) => ({
          date: r.date,
          description: r.description,
          account: r.account,
          toAccount: r.toAccount,
          type: r.type,
          amount: r.amount,
          person: r.person,
        }));
    default:
      return [
        { period: title, ...totals(rows), transactions: rows.length },
        ...group(rows, "type"),
      ];
  }
}
export function budgetSpent(b: RecordData, rows: RecordData[]) {
  return rows
    .filter(
      (t) =>
        t.status !== "Deleted" &&
        t.type === "Expense" &&
        (!b.tagId || t.tagId === b.tagId) &&
        (!b.person || b.person === "Combined" || t.person === b.person) &&
        (!b.month || String(t.date).startsWith(b.month)),
    )
    .reduce((s, t) => s + Number(t.amount), 0);
}
export function classifyExpenses(
  rows: RecordData[],
  tags: RecordData[],
): RecordData[] {
  return rows.map((r) => {
    const t = tags.find((t) => t.id === r.tagId);
    const parent = tags.find((p) => p.id === t?.parent);
    return {
      ...r,
      parentCategory: parent?.name || t?.name || r.tag,
      spendingKind: t?.spendingKind || "Unclassified",
    };
  });
}
export function shiftDate(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate();
  base.setUTCDate(Math.min(d, last));
  return base.toISOString().slice(0, 10);
}
export function spendingComparison(
  history: RecordData[],
  range: [string, string],
  months: number,
) {
  const start = shiftDate(range[0], months),
    end = shiftDate(range[1], months);
  return totals(history.filter((r) => r.date >= start && r.date <= end))
    .expense;
}
