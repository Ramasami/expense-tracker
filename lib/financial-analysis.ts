import { z } from "zod";
import { balance, type Snapshot, type RecordData } from "./finance";
import { accountOwners, activeOwners, belongsToOwner } from "./owners";
import { isCredit, isCreditPayment, unpaidCredit } from "./credit";
import { isLoanPayment, loanSummary } from "./loans";
import { aiService } from "./document-scanner";

const rounded = (value: number) => Math.round(value * 100) / 100;
const amount = (row: RecordData) => Number(row.amount) || 0;
function grouped(rows: { name: string; amount: number }[]) {
  const sums = new Map<string, number>();
  for (const row of rows)
    sums.set(row.name, (sums.get(row.name) || 0) + row.amount);
  const groups = [...sums]
    .map(([name, amount]) => ({
      name: name.slice(0, 80),
      amount: rounded(amount),
    }))
    .sort((a, b) => b.amount - a.amount);
  return groups.length <= 40
    ? groups
    : [
        ...groups.slice(0, 39),
        {
          name: "Other categories",
          amount: rounded(groups.slice(39).reduce((s, r) => s + r.amount, 0)),
        },
      ];
}
export function financialSummary(
  data: Snapshot,
  owner: string,
  accountId: string,
  range: [string, string],
) {
  const owners = activeOwners(data.settings);
  const selectedOwner = owners.find((o) => o.name === owner || o.id === owner);
  if (owner !== "Combined" && !selectedOwner)
    throw Error("Choose an active owner.");
  const accounts = data.accounts.filter(
    (a) =>
      a.status === "Active" &&
      (owner === "Combined" ||
        accountOwners(a, owners).includes(selectedOwner!.id)),
  );
  if (accountId && !accounts.some((a) => a.id === accountId))
    throw Error("Choose an account belonging to this owner.");
  const scoped = accounts.filter((a) => !accountId || a.id === accountId);
  const inScope = (r: RecordData) => {
    const account = data.accounts.find(
      (a) => a.id === r.account || a.name === r.account,
    );
    return account
      ? scoped.some((a) => a.id === account.id)
      : !accountId && belongsToOwner(r, owner, data.accounts, owners);
  };
  const history = data.transactions.filter((r) => r.status === "Active");
  const rows = history.filter(
    (r) => inScope(r) && r.date >= range[0] && r.date <= range[1],
  );
  if (!rows.length)
    throw Error(
      "No transactions for this selection. Choose another period or account.",
    );
  if (
    rows.some((r) => !Number.isFinite(Number(r.amount)) || Number(r.amount) < 0)
  )
    throw Error("Some transaction amounts need correction before analysis.");
  const sum = (items: RecordData[], value = amount) =>
    rounded(items.reduce((s, r) => s + value(r), 0));
  const purchases = rows.filter(
    (r) => r.type === "Expense" && !isCreditPayment(r),
  );
  const incomeRows = rows.filter((r) => r.type === "Income" && !r.cardRefund);
  const investmentRows = rows.filter((r) => r.type === "Investment");
  const expenseValue = (r: RecordData) =>
    isLoanPayment(r) ? Number(r.interestPaid || 0) : amount(r);
  const spending = sum(purchases, expenseValue);
  const refunds = sum(rows.filter((r) => r.cardRefund));
  const income = sum(incomeRows),
    investmentContributions = sum(investmentRows);
  const cashOutflow =
    sum(
      rows.filter(
        (r) => (r.type === "Expense" && !isCredit(r)) || isCreditPayment(r),
      ),
    ) + investmentContributions;
  const dates = rows.map((r) => r.date).sort();
  const first = dates[0],
    last = dates.at(-1)!;
  const months = (start: string, end: string) =>
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7)) +
    1;
  const periodStart = range[0] === "1900-01-01" ? first : range[0];
  const periodEnd = range[1] === "2999-12-31" ? last : range[1];
  const category = (r: RecordData) =>
    data.tags.find((t) => t.id === r.tagId)?.name || r.tag || "Unassigned";
  const categories = grouped(
    purchases.map((r) => ({ name: category(r), amount: expenseValue(r) })),
  );
  const monthly = [...new Set(rows.map((r) => r.date.slice(0, 7)))]
    .sort()
    .slice(-120)
    .map((month) => {
      const selected = rows.filter((r) => r.date.startsWith(month));
      return {
        month,
        income: sum(
          selected.filter((r) => r.type === "Income" && !r.cardRefund),
        ),
        spending: sum(
          selected.filter((r) => r.type === "Expense" && !isCreditPayment(r)),
          expenseValue,
        ),
        investments: sum(selected.filter((r) => r.type === "Investment")),
      };
    });
  const loans = data.settings.filter(
    (r) =>
      r.kind === "loan" &&
      r.status === "Active" &&
      scoped.some((a) => a.id === r.accountId),
  );
  const warnings = [
    "Figures cover recorded transactions only; missing statements or accounts can change the conclusions.",
    "Spending counts purchases and loan interest; card repayments and loan principal are shown separately.",
    "Income can include refunds and one-off receipts. It is not assumed to be recurring salary.",
    "Investments show contributions, not market value, asset allocation, or investment returns.",
    "Current balance uses all recorded history; report flows use the selected dates. Ordinary account transfers are excluded from cash surplus.",
  ];
  if (rows.some((r) => r.settlementStatus === "Unknown"))
    warnings.push(
      "Some card history has unknown settlement status; known unpaid amounts are not a complete statement balance.",
    );
  if (months(first, last) > 120)
    warnings.push(
      "The monthly trend includes only the most recent 120 recorded months.",
    );
  if (
    rows.some(
      (r) =>
        !data.accounts.some((a) => a.id === r.account || a.name === r.account),
    )
  )
    warnings.push("Some included transactions have no matching account.");
  return {
    currency: "INR" as const,
    scope: {
      ownerCount: owner === "Combined" ? owners.length : 1,
      accountCount: scoped.length,
    },
    period: {
      start: periodStart,
      end: periodEnd,
      firstRecordedDate: first,
      lastRecordedDate: last,
      months: Math.max(1, months(periodStart, periodEnd)),
      transactionCount: rows.length,
    },
    totals: {
      income,
      spending,
      cardRefunds: refunds,
      netSpending: rounded(spending - refunds),
      investmentContributions,
      cashOutflow: rounded(cashOutflow),
      cashSurplus: rounded(income - cashOutflow),
      currentBalance: rounded(
        scoped.reduce((s, a) => s + balance(a, history), 0),
      ),
      loanPrincipalPaid: sum(rows.filter(isLoanPayment), (r) =>
        Number(r.principalPaid || 0),
      ),
      loanInterestPaid: sum(rows.filter(isLoanPayment), (r) =>
        Number(r.interestPaid || 0),
      ),
      cardPayments: sum(rows.filter(isCreditPayment)),
      creditPurchases: sum(rows.filter(isCredit)),
    },
    categories,
    incomeCategories: grouped(
      incomeRows.map((r) => ({ name: category(r), amount: amount(r) })),
    ),
    investments: grouped(
      investmentRows.map((r) => ({ name: category(r), amount: amount(r) })),
    ),
    monthly,
    debt: {
      knownUnpaidCards: sum(unpaidCredit(history).filter(inScope)),
      unknownCardHistory: sum(
        unpaidCredit(history, undefined, true).filter(
          (r) => inScope(r) && r.settlementStatus === "Unknown",
        ),
      ),
      remainingLoanPrincipal: rounded(
        loans.reduce(
          (s, l) => s + loanSummary(l, history).remainingPrincipal,
          0,
        ),
      ),
      loanRates: loans.map((l) => Number(l.interestRate || 0)).slice(0, 50),
    },
    warnings,
  };
}
export type FinancialSummary = ReturnType<typeof financialSummary>;
export const analysisSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(2000),
  sections: z
    .array(
      z.object({
        area: z.enum(["spending", "saving", "investing", "debt"]),
        headline: z.string().min(1).max(160),
        body: z.string().max(3000),
        actions: z
          .array(
            z.object({
              title: z.string().max(160),
              why: z.string().max(1500),
              priority: z.enum(["high", "medium", "low"]),
              steps: z.array(z.string().max(500)).max(6),
            }),
          )
          .max(5),
      }),
    )
    .length(4)
    .refine(
      (s) => new Set(s.map((r) => r.area)).size === 4,
      "The analysis must cover spending, saving, investing and debt.",
    ),
  questions: z.array(z.string().max(500)).max(8),
  caveats: z.array(z.string().max(700)).max(8),
});
export type FinancialAnalysisResult = z.infer<typeof analysisSchema>;
export type AnalysisPreferences = {
  risk: "Not specified" | "Low" | "Medium" | "High";
  horizon: "Not specified" | "Under 3 years" | "3–7 years" | "Over 7 years";
};
export async function analyzeFinances(
  summary: FinancialSummary,
  preferences: AnalysisPreferences,
  provider: string,
) {
  const response = await aiService("analyzeFinances", {
    summary,
    preferences,
    provider,
    confirmed: true,
  });
  return {
    report: analysisSchema.parse(response.report),
    generatedAt: String(response.generatedAt),
    model: String(response.model),
  };
}
export function savingsScenario(
  summary: FinancialSummary,
  category: string,
  percent: number,
) {
  const value =
    summary.categories.find((r) => r.name === category)?.amount || 0;
  const monthly = rounded(
    (value * Math.max(0, Math.min(100, percent))) / 100 / summary.period.months,
  );
  return { monthly, annual: rounded(monthly * 12) };
}
