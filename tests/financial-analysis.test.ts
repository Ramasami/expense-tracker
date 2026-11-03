import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  financialSummary,
  savingsScenario,
  analysisSchema,
} from "../lib/financial-analysis";
import { empty, type Snapshot, type RecordData } from "../lib/finance";
const row = (input: any): RecordData => ({
  id: crypto.randomUUID(),
  version: 1,
  status: "Active",
  date: "2026-11-02",
  account: "ram",
  ...input,
});
function data(): Snapshot {
  return {
    ...structuredClone(empty),
    settings: [
      row({
        id: "r",
        kind: "owner",
        name: "Ram",
        emails: ["private@example.test"],
      }),
      row({ id: "v", kind: "owner", name: "Varsha" }),
      row({
        id: "loan",
        kind: "loan",
        accountId: "ram",
        principal: 10000,
        interestRate: 8,
        openingPrincipalPaid: 0,
      }),
    ],
    accounts: [
      row({
        id: "ram",
        name: "Private account 123456789",
        ownerIds: ["r"],
        openingBalance: 500,
      }),
      row({
        id: "varsha",
        name: "Second private bank",
        ownerIds: ["v"],
        openingBalance: 200,
      }),
      row({ id: "shared", ownerIds: ["r", "v"], openingBalance: 0 }),
    ],
    tags: [
      row({ id: "food", name: "Food" }),
      row({ id: "salary", name: "Salary" }),
      row({ id: "invest", name: "Mutual funds" }),
    ],
    transactions: [
      row({
        id: "salary",
        type: "Income",
        amount: 2000,
        tagId: "salary",
        description: "PRIVATE EMPLOYER",
      }),
      row({
        id: "cash",
        type: "Expense",
        amount: 100,
        tagId: "food",
        receipts: [{ id: "SECRET_RECEIPT" }],
      }),
      row({
        id: "credit",
        type: "Expense",
        expenseMode: "Credit",
        amount: 200,
        tagId: "food",
      }),
      row({
        id: "payment",
        type: "Transfer",
        creditPayment: true,
        toAccount: "ram",
        amount: 80,
        paidTransactionIds: ["credit"],
        creditAllocations: { credit: 80 },
      }),
      row({
        id: "loanPayment",
        type: "Expense",
        loanPayment: true,
        loanId: "loan",
        amount: 300,
        principalPaid: 250,
        interestPaid: 50,
        tagId: "food",
      }),
      row({
        id: "investment",
        type: "Investment",
        amount: 400,
        tagId: "invest",
      }),
      row({
        id: "internal",
        type: "Transfer",
        toAccount: "varsha",
        amount: 500,
      }),
      row({
        id: "sharedExpense",
        account: "shared",
        type: "Expense",
        amount: 20,
        tagId: "food",
      }),
      row({
        id: "varshaExpense",
        account: "varsha",
        type: "Expense",
        amount: 40,
        tagId: "food",
      }),
      row({ id: "deleted", type: "Expense", amount: 99999, status: "Deleted" }),
      row({
        id: "older",
        type: "Income",
        amount: 20,
        date: "2026-01-01",
        tagId: "salary",
      }),
    ],
  };
}
const range: [string, string] = ["2026-11-01", "2026-11-30"];
test("analysis separates cash, credit purchases, settlements, loan principal and investments", () => {
  const s = financialSummary(data(), "Ram", "", range);
  assert.equal(s.totals.income, 2000);
  assert.equal(s.totals.spending, 370); // 100 cash + 200 credit + 50 interest + 20 shared
  assert.equal(s.totals.cardPayments, 80);
  assert.equal(s.totals.cashOutflow, 900); // 100 + 300 + 80 + 400 + 20
  assert.equal(s.totals.cashSurplus, 1100);
  assert.equal(s.totals.investmentContributions, 400);
  assert.equal(s.totals.loanPrincipalPaid, 250);
  assert.equal(s.debt.remainingLoanPrincipal, 9750);
  assert.equal(s.debt.knownUnpaidCards, 120);
  assert.equal(s.totals.currentBalance, 1120); // includes January receipt and excludes credit purchases
  assert.deepEqual(savingsScenario(s, "Food", 10), {
    monthly: 37,
    annual: 444,
  });
});
test("All owners count shared accounts once, narrow account scopes and reject mismatched owners", () => {
  const d = data();
  assert.equal(financialSummary(d, "Combined", "", range).totals.spending, 410);
  assert.equal(financialSummary(d, "Varsha", "", range).totals.spending, 60);
  assert.equal(financialSummary(d, "Ram", "ram", range).totals.spending, 350);
  assert.throws(() => financialSummary(d, "Varsha", "ram", range), /belonging/);
  assert.throws(
    () => financialSummary(d, "Removed owner", "", range),
    /active owner/,
  );
  const text = JSON.stringify(financialSummary(d, "Combined", "", range));
  for (const secret of [
    "PRIVATE EMPLOYER",
    "private@example.test",
    "SECRET_RECEIPT",
    "123456789",
  ])
    assert.ok(!text.includes(secret));
});
test("zero-activity months remain in scenario divisor; refunds are distinct and absent data fails closed", () => {
  const d = data();
  d.transactions.push(row({ type: "Income", cardRefund: true, amount: 25 }));
  const s = financialSummary(d, "Ram", "", ["2026-09-01", "2026-11-30"]);
  assert.equal(s.period.months, 3);
  assert.equal(s.totals.income, 2000);
  assert.equal(s.totals.netSpending, 345);
  assert.deepEqual(savingsScenario(s, "Food", 30), {
    monthly: 37,
    annual: 444,
  });
  assert.throws(
    () => financialSummary(d, "Ram", "", ["2020-01-01", "2020-01-31"]),
    /No transactions/,
  );
});
const report = {
  title: "Your money review",
  summary: "Review spending and keep a buffer.",
  sections: ["spending", "saving", "investing", "debt"].map((area) => ({
    area,
    headline: `Review ${area}`,
    body: "Based on the supplied figures.",
    actions: [
      {
        title: "Review a category",
        why: "It is a large share of recorded spending.",
        priority: "medium",
        steps: ["Compare recurring costs."],
      },
    ],
  })),
  questions: ["What is your goal and horizon?"],
  caveats: ["Missing records can change the results."],
};
function server(provider = "gemini", status = 200) {
  const props = new Map<string, string>([
    ["AI_PROVIDER", provider],
    ["GEMINI_API_KEY", "server-only-key"],
    ["OPENAI_API_KEY", "server-only-key"],
    ["GROQ_API_KEY", "server-only-key"],
    ["ANTHROPIC_API_KEY", "server-only-key"],
  ]);
  const calls: any[] = [];
  const sandbox: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => props.get(key) || null,
        setProperty: (key: string, value: string) => props.set(key, value),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    Utilities: { formatDate: () => "2026-11-03" },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        calls.push({ url, options });
        const text = JSON.stringify(report);
        return {
          getResponseCode: () => status,
          getContentText: () =>
            JSON.stringify(
              provider === "gemini"
                ? {
                    candidates: [
                      { finishReason: "STOP", content: { parts: [{ text }] } },
                    ],
                  }
                : provider === "groq"
                  ? {
                      choices: [
                        { finish_reason: "stop", message: { content: text } },
                      ],
                    }
                  : provider === "claude"
                    ? {
                        stop_reason: "end_turn",
                        content: [{ type: "text", text }],
                      }
                    : {
                        status: "completed",
                        output: [{ content: [{ type: "output_text", text }] }],
                      },
            ),
          getAllHeaders: () => ({}),
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), sandbox);
  const request = {
    provider,
    confirmed: true,
    summary: financialSummary(data(), "Ram", "", range),
    preferences: { risk: "Not specified", horizon: "Not specified" },
  };
  return { sandbox, calls, request };
}
for (const provider of ["gemini", "openai", "groq", "claude"])
  test(`${provider} financial analysis stays read-only and returns validated structured sections`, () => {
    const { sandbox, calls, request } = server(provider);
    const output = sandbox.analyzeFinances_(request, "allowed-actor");
    assert.equal(analysisSchema.parse(output.report).sections.length, 4);
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(output).includes("server-only-key"));
    const payload = JSON.parse(calls[0].options.payload);
    assert.ok(!JSON.stringify(payload).includes("allowed-actor"));
    if (provider === "openai") {
      assert.equal(payload.store, false);
      assert.equal(payload.text.format.strict, true);
      assert.ok(!payload.tools);
    }
    assert.throws(
      () => sandbox.analyzeFinances_(request, "allowed-actor"),
      /Wait a minute/,
    );
  });
test("financial analysis requires confirmation, rejects raw/unbounded payloads and fails on provider errors", () => {
  const { sandbox, calls, request } = server();
  assert.throws(
    () => sandbox.analyzeFinances_({ ...request, confirmed: false }, "actor"),
    /confirm/,
  );
  assert.throws(
    () =>
      sandbox.analyzeFinances_(
        {
          ...request,
          summary: { ...request.summary, transactions: [{ notes: "private" }] },
        },
        "actor",
      ),
    /Invalid financial summary/,
  );
  assert.throws(
    () =>
      sandbox.analyzeFinances_(
        {
          ...request,
          summary: {
            ...request.summary,
            totals: { ...request.summary.totals, income: Infinity },
          },
        },
        "actor",
      ),
    /Invalid financial amount/,
  );
  assert.equal(calls.length, 0);
  const fail = server("gemini", 503);
  assert.throws(
    () => fail.sandbox.analyzeFinances_(fail.request, "actor"),
    /503/,
  );
  assert.equal(fail.calls.length, 1); // no automatic retries of financial summaries
  assert.throws(() =>
    analysisSchema.parse({
      ...report,
      sections: [
        report.sections[0],
        report.sections[0],
        report.sections[0],
        report.sections[0],
      ],
    }),
  );
});
