"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { money, type RecordData } from "../lib/finance";
import { cashForecast, type CashAssumptions } from "../lib/smart-finance";
import { todayIST } from "../lib/planning";
import "./smart-finance.css";
export default function CashForecast({
  accounts,
  rows,
  stale,
}: {
  accounts: RecordData[];
  rows: RecordData[];
  stale: boolean;
}) {
  const [accountId, setAccountId] = useState("");
  const [scenario, setScenario] = useState<Partial<CashAssumptions>>({});
  const [expanded, setExpanded] = useState(false);
  const cashAccounts = accounts.filter((a) => a.type !== "Credit Card");
  const selected = cashAccounts.filter((a) => !accountId || a.id === accountId);
  const validSelection =
    !accountId || cashAccounts.some((a) => a.id === accountId);
  const asOf = todayIST();
  const baseline = useMemo(() => {
    try {
      return cashForecast(selected, rows, asOf);
    } catch {
      return null;
    }
  }, [accounts, rows, asOf, accountId]);
  const fieldValue = (key: keyof CashAssumptions, fallback: number) => {
    const value = scenario[key] ?? fallback;
    return Number.isFinite(value) ? value : "";
  };
  const result = useMemo(() => {
    try {
      return { data: cashForecast(selected, rows, asOf, scenario), error: "" };
    } catch (e) {
      return { data: null, error: (e as Error).message };
    }
  }, [accounts, rows, asOf, scenario, accountId]);
  const forecast = result.data;
  const change = (key: keyof CashAssumptions, value: string) =>
    setScenario((s) => ({ ...s, [key]: value === "" ? NaN : Number(value) }));
  return (
    <section className="card cash-forecast" aria-label="Cash-flow forecast">
      <div className="card-heading">
        <div>
          <span className="eyebrow">LOOK AHEAD</span>
          <h2>Cash-flow forecast</h2>
          <p>
            A scenario based on recorded cash movements. Adjust it to match what
            you expect.
          </p>
        </div>
      </div>
      <div className="forecast-toolbar">
        <label>
          Account
          <select
            aria-label="Forecast account"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setScenario({});
            }}
          >
            <option value="">All accounts in this view</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Look ahead
          <select
            aria-label="Forecast horizon"
            value={scenario.days || 90}
            onChange={(e) =>
              setScenario((s) => ({
                ...s,
                days: Number(e.target.value),
                adjustmentDay: Math.min(
                  s.adjustmentDay || 1,
                  Number(e.target.value),
                ),
              }))
            }
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>
        </label>
      </div>
      {stale && (
        <p role="status" className="smart-warning">
          Offline or stale data · This forecast uses your last synced records.
        </p>
      )}
      {!validSelection || !selected.length ? (
        <p>Select an available cash account.</p>
      ) : (
        <>
          {result.error && (
            <p role="alert" className="smart-warning">
              {result.error}
            </p>
          )}
          {forecast && (
            <>
              <div className="forecast-metrics">
                <div>
                  <small>Starting cash · {asOf}</small>
                  <strong>{money(forecast.opening)}</strong>
                </div>
                <div>
                  <small>Projected · {forecast.points.at(-1)!.date}</small>
                  <strong>{money(forecast.end)}</strong>
                </div>
                <div>
                  <small>Lowest projected cash</small>
                  <strong>{money(forecast.low)}</strong>
                </div>
              </div>
              {forecast.shortfall && (
                <p className="smart-warning">
                  Cash could fall below zero on {forecast.shortfall}. Adjust the
                  assumptions to explore alternatives.
                </p>
              )}
              <div
                className="forecast-chart"
                role="img"
                aria-label={`Projected cash from ${money(forecast.opening)} to ${money(forecast.end)}. Lowest balance ${money(forecast.low)}.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={forecast.points}
                    margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
                  >
                    <XAxis
                      dataKey="date"
                      minTickGap={55}
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      tickFormatter={(v) => String(v).slice(5)}
                    />
                    <YAxis
                      width={65}
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      tickFormatter={(v) =>
                        Math.abs(v) >= 1000
                          ? `${Number((v / 1000).toFixed(1))}k`
                          : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                      formatter={(v) => money(Number(v))}
                      labelFormatter={(v) => String(v)}
                    />
                    <ReferenceLine y={0} stroke="var(--red)" />
                    <Area
                      dataKey="balance"
                      name="Projected cash"
                      stroke="var(--teal)"
                      fill="var(--teal)"
                      fillOpacity={0.12}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="smart-caption">
                {forecast.sampleCount} cash movements across{" "}
                {forecast.observedDays} days in the last 90 days.{" "}
                {forecast.observedDays < 30
                  ? "Limited history: the estimate uses at least a 30-day denominator. "
                  : ""}
                Income includes one-off receipts; review it before relying on
                the forecast.
              </p>
            </>
          )}
          <button
            className="outline"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide assumptions" : "Adjust assumptions"}
          </button>
          {expanded && (
            <div className="forecast-assumptions">
              <label>
                Expected monthly income (₹)
                <input
                  aria-label="Expected monthly income"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fieldValue(
                    "monthlyIncome",
                    baseline?.assumptions.monthlyIncome || 0,
                  )}
                  onChange={(e) => change("monthlyIncome", e.target.value)}
                />
              </label>
              <label>
                Expected monthly cash outflow (₹)
                <input
                  aria-label="Expected monthly cash outflow"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fieldValue(
                    "monthlyOutflow",
                    baseline?.assumptions.monthlyOutflow || 0,
                  )}
                  onChange={(e) => change("monthlyOutflow", e.target.value)}
                />
              </label>
              <label>
                One-off adjustment (₹)
                <input
                  aria-label="One-off adjustment"
                  type="number"
                  step="0.01"
                  value={fieldValue("adjustment", 0)}
                  onChange={(e) => change("adjustment", e.target.value)}
                />
                <small>Positive adds cash; negative spends it.</small>
              </label>
              <label>
                Apply adjustment on day
                <input
                  aria-label="Adjustment day"
                  type="number"
                  min="1"
                  max={scenario.days || 90}
                  step="1"
                  value={fieldValue("adjustmentDay", 1)}
                  onChange={(e) => change("adjustmentDay", e.target.value)}
                />
              </label>
              <button className="outline" onClick={() => setScenario({})}>
                Reset to history
              </button>
            </div>
          )}
          <details className="smart-notes">
            <summary>How this estimate works</summary>
            {forecast && (
              <>
                {/* Card debt is context, not an extra forecast debit. */}{" "}
                <p className="smart-caption">
                  Known unpaid card purchases: {money(forecast.knownUnpaid)}{" "}
                  (including unknown settlement history). Card payments and loan
                  repayments already contribute to historical cash outflow; this
                  amount is not added again.
                </p>
                {!!forecast.futureRecorded && (
                  <p className="smart-caption">
                    {forecast.futureRecorded} future-dated records are excluded
                    from starting cash and this historical-average scenario.
                  </p>
                )}
              </>
            )}
            <p>
              Cash flows are spread evenly over days, so this is not a bill-date
              or salary-date prediction. Transfers are excluded from the trend,
              but recorded transfers affect starting cash. Investments, full
              loan repayments and card settlements reduce cash; credit purchases
              do not reduce it until paid. Recurring schedules and upcoming
              bills are not added separately to avoid double counting. Include
              expected bills in the monthly outflow or as a negative one-off
              adjustment. These scenarios do not change your Sheet.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
