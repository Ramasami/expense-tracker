"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, ArrowRight, Check, TrendingUp } from "lucide-react";
import { type RecordData, dateRange, money } from "../lib/finance";
import { accountOwners } from "../lib/owners";
import { readGoogleSnapshot } from "../lib/google-sheets";
import { scannerStatus } from "../lib/document-scanner";
import { AI_PROVIDERS, type AIProvider } from "../lib/ai-providers";
import {
  financialSummary,
  analyzeFinances,
  savingsScenario,
  type FinancialSummary,
  type FinancialAnalysisResult,
  type AnalysisPreferences,
} from "../lib/financial-analysis";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
const tabs = ["overview", "spending", "saving", "investing", "debt"] as const;
const labels = {
  overview: "Overview",
  spending: "Spending",
  saving: "Savings",
  investing: "Investing",
  debt: "Debt",
};
export default function FinancialAnalysis({
  defaultOwner,
  defaultAccount,
  owners,
  accounts,
  disabled,
}: {
  defaultOwner: string;
  defaultAccount: string;
  owners: RecordData[];
  accounts: RecordData[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [owner, setOwner] = useState(defaultOwner),
    [account, setAccount] = useState(defaultAccount);
  const [period, setPeriod] = useState("Last 90 Days"),
    [risk, setRisk] = useState<AnalysisPreferences["risk"]>("Not specified"),
    [horizon, setHorizon] =
      useState<AnalysisPreferences["horizon"]>("Not specified");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [provider, setProvider] = useState<AIProvider | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<FinancialAnalysisResult | null>(null),
    [generatedAt, setGeneratedAt] = useState(""),
    [snapshotAt, setSnapshotAt] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview"),
    [category, setCategory] = useState(""),
    [reduction, setReduction] = useState(10);
  const [doneActions, setDoneActions] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useDialogScrollLock(open);
  function reset() {
    setSummary(null);
    setResult(null);
    setConfirmed(false);
    setError("");
    setDoneActions([]);
  }
  function close() {
    if (!busy) {
      setOpen(false);
      reset();
      trigger.current?.focus();
    }
  }
  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const controls = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[href],summary,[tabindex="0"]',
          ) || []),
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, busy]);
  const eligibleAccounts = accounts.filter(
    (a) =>
      a.status === "Active" &&
      (owner === "Combined" ||
        accountOwners(a, owners).includes(
          owners.find((o) => o.name === owner)?.id || "",
        )),
  );
  async function prepare() {
    if (busy || disabled) return;
    setBusy("Reading fresh data from Google Sheets…");
    reset();
    try {
      const [fresh, setup] = await Promise.all([
        readGoogleSnapshot({ collections: ["accounts", "settings"] }),
        scannerStatus(),
      ]);
      if (!setup.configured)
        throw Error("Choose an AI with a saved key in Settings first.");
      const facts = financialSummary(
        fresh.data,
        owner,
        account,
        dateRange(period),
      );
      setSummary(facts);
      setSnapshotAt(new Date().toISOString());
      setProvider(setup.provider || "openai");
      setCategory(facts.categories[0]?.name || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (busy || disabled || !confirmed || !summary || !provider) return;
    setBusy(`Analyzing with ${AI_PROVIDERS[provider].name}…`);
    setError("");
    setResult(null);
    try {
      const report = await analyzeFinances(
        summary,
        { risk, horizon },
        provider,
      );
      setResult(report.report);
      setGeneratedAt(report.generatedAt);
      setTab("overview");
      setDoneActions([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const scenario = summary
    ? savingsScenario(summary, category, reduction)
    : { monthly: 0, annual: 0 };
  const section = result?.sections.find((s) => s.area === tab);
  const metrics = summary
    ? ([
        ["Income received", summary.totals.income],
        ["Net spending", summary.totals.netSpending],
        ["Cash surplus", summary.totals.cashSurplus],
        ["Investment contributions", summary.totals.investmentContributions],
      ] as const)
    : [];
  return (
    <>
      <button
        ref={trigger}
        className="ai-analysis-trigger"
        disabled={disabled}
        onClick={() => {
          reset();
          setOwner(defaultOwner);
          setAccount(defaultAccount);
          setOpen(true);
        }}
      >
        <Sparkles size={16} />
        Analyze my finances
      </button>
      {open &&
        createPortal(
          <div className="modal-overlay">
            <section
              ref={dialog}
              className="modal finance-review"
              role="dialog"
              aria-modal="true"
              aria-labelledby="finance-review-title"
            >
              <header className="finance-review-heading">
                <div>
                  <span className="eyebrow">A CLEARER PICTURE</span>
                  <h2 id="finance-review-title" ref={heading} tabIndex={-1}>
                    Your AI money review
                  </h2>
                  <p>Understand your money. Decide your next move.</p>
                </div>
                <button
                  aria-label="Close financial analysis"
                  disabled={!!busy}
                  onClick={close}
                >
                  <X size={21} />
                </button>
              </header>
              <details className="finance-scope-details" open={!result}>
                <summary>Change owner, account or period</summary>
                <fieldset
                  className="finance-review-scope"
                  disabled={!!busy || disabled}
                >
                  <label className="field">
                    Owner
                    <select
                      aria-label="Analysis owner"
                      value={owner}
                      onChange={(e) => {
                        setOwner(e.target.value);
                        setAccount("");
                        reset();
                      }}
                    >
                      <option value="Combined">All owners</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.name}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Account
                    <select
                      aria-label="Analysis account"
                      value={account}
                      onChange={(e) => {
                        setAccount(e.target.value);
                        reset();
                      }}
                    >
                      <option value="">All accounts</option>
                      {eligibleAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Period
                    <select
                      aria-label="Analysis period"
                      value={period}
                      onChange={(e) => {
                        setPeriod(e.target.value);
                        reset();
                      }}
                    >
                      {[
                        "Last 30 Days",
                        "Last 90 Days",
                        "Last 12 Months",
                        "This Year",
                        "All Time",
                      ].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </details>
              {!result && (
                <>
                  <details className="finance-preferences">
                    <summary>
                      Investment preferences <span>optional</span>
                    </summary>
                    <fieldset className="form-grid" disabled={!!busy}>
                      <label className="field">
                        Risk comfort
                        <select
                          aria-label="Investment risk comfort"
                          value={risk}
                          onChange={(e) => {
                            setRisk(
                              e.target.value as AnalysisPreferences["risk"],
                            );
                            setConfirmed(false);
                          }}
                        >
                          {["Not specified", "Low", "Medium", "High"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="field">
                        Investment horizon
                        <select
                          aria-label="Investment horizon"
                          value={horizon}
                          onChange={(e) => {
                            setHorizon(
                              e.target.value as AnalysisPreferences["horizon"],
                            );
                            setConfirmed(false);
                          }}
                        >
                          {[
                            "Not specified",
                            "Under 3 years",
                            "3–7 years",
                            "Over 7 years",
                          ].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                  </details>
                  {!summary && (
                    <div className="finance-review-intro">
                      <div className="finance-spark">
                        <Sparkles size={27} />
                      </div>
                      <h3>Turn your numbers into a plan</h3>
                      <p>
                        Spending patterns, savings opportunities, investment
                        ideas, and debt—all in one review.
                      </p>
                      <button
                        className="primary"
                        disabled={!!busy || disabled}
                        onClick={() => void prepare()}
                      >
                        Review my data <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {summary && (
                <>
                  <div className="finance-report-context">
                    <span>
                      {owner === "Combined" ? "All owners" : owner} ·{" "}
                      {account
                        ? eligibleAccounts.find((a) => a.id === account)?.name
                        : "All accounts"}
                    </span>
                    <span>
                      {summary.period.start} — {summary.period.end} ·{" "}
                      {summary.period.transactionCount} record
                      {summary.period.transactionCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="finance-snapshot">
                    Current balance{" "}
                    <strong>{money(summary.totals.currentBalance)}</strong>
                    <span>
                      Sheet synced{" "}
                      {new Date(snapshotAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <div className="finance-metrics">
                    {metrics.map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{money(value)}</strong>
                      </div>
                    ))}
                  </div>
                  {!result && (
                    <div className="finance-send-review">
                      <h3>
                        Ready for{" "}
                        {provider ? AI_PROVIDERS[provider].label : "your AI"}
                      </h3>
                      <p>
                        Send totals, category labels, monthly trends, and debt
                        figures for this selection.
                      </p>
                      <details>
                        <summary>Review the exact summary</summary>
                        <pre>{JSON.stringify(summary, null, 2)}</pre>
                      </details>
                      <label className="finance-consent">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={!!busy || disabled}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        <span>
                          Send this financial summary to{" "}
                          {provider
                            ? AI_PROVIDERS[provider].name
                            : "the selected AI"}{" "}
                          for analysis.
                        </span>
                      </label>
                      <button
                        className="primary"
                        disabled={!confirmed || !!busy || disabled}
                        onClick={() => void generate()}
                      >
                        <Sparkles size={16} />
                        Generate analysis
                      </button>
                      <small>Uses the selected API’s quota or billing.</small>
                    </div>
                  )}
                  {result && (
                    <div className="finance-report">
                      <div className="finance-report-title">
                        <div>
                          <span className="finance-ai-label">
                            <Sparkles size={13} />
                            {provider && AI_PROVIDERS[provider].name} insights
                          </span>
                          <h3>{result.title}</h3>
                        </div>
                        <small>
                          {new Date(generatedAt).toLocaleString("en-IN")}
                        </small>
                      </div>
                      <div
                        className="finance-report-tabs"
                        role="tablist"
                        aria-label="Financial analysis sections"
                      >
                        {tabs.map((t, index) => (
                          <button
                            key={t}
                            role="tab"
                            id={`finance-tab-${t}`}
                            aria-selected={tab === t}
                            aria-controls="finance-report-panel"
                            tabIndex={tab === t ? 0 : -1}
                            onClick={() => setTab(t)}
                            onKeyDown={(e) => {
                              if (
                                [
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "Home",
                                  "End",
                                ].includes(e.key)
                              ) {
                                e.preventDefault();
                                const next =
                                  e.key === "Home"
                                    ? 0
                                    : e.key === "End"
                                      ? tabs.length - 1
                                      : (index +
                                          (e.key === "ArrowRight" ? 1 : -1) +
                                          tabs.length) %
                                        tabs.length;
                                setTab(tabs[next]);
                                document
                                  .getElementById(`finance-tab-${tabs[next]}`)
                                  ?.focus();
                              }
                            }}
                          >
                            {labels[t]}
                          </button>
                        ))}
                      </div>
                      <div
                        role="tabpanel"
                        id="finance-report-panel"
                        aria-labelledby={`finance-tab-${tab}`}
                        tabIndex={0}
                        className="finance-report-panel"
                      >
                        {tab === "overview" ? (
                          <>
                            <p className="finance-narrative">
                              {result.summary}
                            </p>
                            <div className="finance-insight-grid">
                              {result.sections.map((s) => (
                                <button
                                  className="finance-insight-link"
                                  key={s.area}
                                  onClick={() => setTab(s.area)}
                                >
                                  <span>{labels[s.area]}</span>
                                  <strong>{s.headline}</strong>
                                  <ArrowRight size={16} />
                                </button>
                              ))}
                            </div>
                            <details className="finance-trends">
                              <summary>Monthly income & spending</summary>
                              {summary.monthly.map((m) => (
                                <div key={m.month}>
                                  <span>{m.month}</span>
                                  <span>Income {money(m.income)}</span>
                                  <span>Spending {money(m.spending)}</span>
                                  <span>Invested {money(m.investments)}</span>
                                </div>
                              ))}
                            </details>
                          </>
                        ) : (
                          <>
                            <h3>{section?.headline}</h3>
                            <p className="finance-narrative">{section?.body}</p>
                            {tab === "spending" && (
                              <div
                                className="finance-category-chart"
                                aria-label="Spending by category"
                              >
                                {summary.categories.map((c) => (
                                  <button
                                    key={c.name}
                                    aria-pressed={category === c.name}
                                    onClick={() => setCategory(c.name)}
                                  >
                                    <span>{c.name}</span>
                                    <strong>
                                      {money(c.amount)} ·{" "}
                                      {summary.totals.spending
                                        ? Math.round(
                                            (100 * c.amount) /
                                              summary.totals.spending,
                                          )
                                        : 0}
                                      %
                                    </strong>
                                    <span className="finance-bar-track">
                                      <span
                                        style={{
                                          width: `${summary.totals.spending ? (100 * c.amount) / summary.totals.spending : 0}%`,
                                        }}
                                      />
                                    </span>
                                  </button>
                                ))}
                                <button
                                  className="finance-category-next"
                                  onClick={() => setTab("saving")}
                                >
                                  Explore savings in{" "}
                                  {category || "this category"}{" "}
                                  <ArrowRight size={14} />
                                </button>
                                <small>
                                  Purchases and interest before card refunds:{" "}
                                  {money(summary.totals.cardRefunds)} refunded.
                                </small>
                              </div>
                            )}
                            {tab === "saving" &&
                              summary.categories.length > 0 && (
                                <section className="finance-scenario">
                                  <h4>
                                    <TrendingUp size={17} />
                                    Try a saving scenario
                                  </h4>
                                  <label className="field">
                                    Spending category
                                    <select
                                      aria-label="Savings scenario category"
                                      value={category}
                                      onChange={(e) =>
                                        setCategory(e.target.value)
                                      }
                                    >
                                      {summary.categories.map((c) => (
                                        <option key={c.name}>{c.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="finance-slider">
                                    Reduce by <strong>{reduction}%</strong>
                                    <input
                                      aria-label="Spending reduction percent"
                                      type="range"
                                      min="0"
                                      max="50"
                                      step="1"
                                      value={reduction}
                                      onChange={(e) =>
                                        setReduction(Number(e.target.value))
                                      }
                                    />
                                  </label>
                                  <div>
                                    <span>
                                      Monthly equivalent
                                      <strong>{money(scenario.monthly)}</strong>
                                    </span>
                                    <span>
                                      Yearly illustration
                                      <strong>{money(scenario.annual)}</strong>
                                    </span>
                                  </div>
                                  <small>
                                    Illustration based on{" "}
                                    {summary.period.months} calendar month(s),
                                    not a forecast. Check which costs can
                                    actually be reduced.
                                  </small>
                                </section>
                              )}
                            {tab === "investing" && (
                              <div className="finance-contribution-list">
                                <h4>Where you contributed</h4>
                                {summary.investments.length ? (
                                  summary.investments.map((c) => (
                                    <div key={c.name}>
                                      <span>{c.name}</span>
                                      <strong>{money(c.amount)}</strong>
                                    </div>
                                  ))
                                ) : (
                                  <p>
                                    No investment contributions recorded in this
                                    period.
                                  </p>
                                )}
                                <small>
                                  Contributions are not current portfolio values
                                  or returns.
                                </small>
                                <a
                                  href="https://investor.sebi.gov.in/investment-thingsbeforeinv.html"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  SEBI: factors to consider before investing ↗
                                </a>
                              </div>
                            )}
                            {tab === "debt" && (
                              <div className="finance-metrics">
                                <div>
                                  <span>Known unpaid card charges</span>
                                  <strong>
                                    {money(summary.debt.knownUnpaidCards)}
                                  </strong>
                                </div>
                                <div>
                                  <span>Card history needing review</span>
                                  <strong>
                                    {money(summary.debt.unknownCardHistory)}
                                  </strong>
                                </div>
                                <div>
                                  <span>Remaining loan principal</span>
                                  <strong>
                                    {money(summary.debt.remainingLoanPrincipal)}
                                  </strong>
                                </div>
                                <div>
                                  <span>Principal paid in period</span>
                                  <strong>
                                    {money(summary.totals.loanPrincipalPaid)}
                                  </strong>
                                </div>
                              </div>
                            )}
                            <div className="finance-actions">
                              {section?.actions.map((a, i) => {
                                const id = `${tab}-${i}`;
                                return (
                                  <details key={id}>
                                    <summary>
                                      <span
                                        className={`finance-priority ${a.priority}`}
                                      >
                                        {a.priority}
                                      </span>
                                      <strong>{a.title}</strong>
                                      {doneActions.includes(id) && (
                                        <Check size={16} />
                                      )}
                                    </summary>
                                    <p>{a.why}</p>
                                    <ol>
                                      {a.steps.map((step, j) => (
                                        <li key={j}>{step}</li>
                                      ))}
                                    </ol>
                                    <label className="finance-action-check">
                                      <input
                                        type="checkbox"
                                        checked={doneActions.includes(id)}
                                        onChange={(e) =>
                                          setDoneActions((current) =>
                                            e.target.checked
                                              ? [...current, id]
                                              : current.filter((v) => v !== id),
                                          )
                                        }
                                      />
                                      Reviewed this idea
                                    </label>
                                  </details>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                      {result.questions.length > 0 && (
                        <details className="finance-questions">
                          <summary>
                            Questions to refine your plan (
                            {result.questions.length})
                          </summary>
                          <ul>
                            {result.questions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <details className="finance-coverage">
                        <summary>Data coverage & assumptions</summary>
                        <ul>
                          {[...summary.warnings, ...result.caveats].map(
                            (w, i) => (
                              <li key={i}>{w}</li>
                            ),
                          )}
                        </ul>
                      </details>
                      <div className="finance-report-bottom">
                        <span>
                          Ideas to review. Nothing in your accounts has been
                          changed.
                        </span>
                        <button
                          disabled={!!busy || disabled}
                          onClick={() => {
                            reset();
                          }}
                        >
                          New analysis
                        </button>
                        <button onClick={close}>Close review</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {busy && (
                <div className="finance-analysis-progress" role="status">
                  <progress />
                  <span>{busy}</span>
                </div>
              )}
              {error && (
                <p role="alert" className="finance-analysis-error">
                  {error}
                </p>
              )}
              <details className="finance-how">
                <summary>How this review works</summary>
                <p>
                  Choose one owner or All owners. Shared accounts are counted
                  once. Review fresh Sheet totals, then generate insights with
                  your saved AI. Use the tabs, expand action cards, or adjust
                  the savings calculator. Scenario changes make no additional AI
                  calls. A new selection needs a new review; the report is not
                  saved as financial data.
                </p>
              </details>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
