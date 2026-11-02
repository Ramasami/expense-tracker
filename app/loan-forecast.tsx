"use client";
import { useEffect, useState } from "react";
import { RecordData, money } from "../lib/finance";
import { loanSummary } from "../lib/loans";
import { loanForecast, todayIST } from "../lib/planning";
export default function LoanForecast({
  loan,
  rows,
}: {
  loan: RecordData;
  rows: RecordData[];
}) {
  const [payment, setPayment] = useState(String(loan.scheduledEmi || "")),
    [extra, setExtra] = useState(""),
    [lump, setLump] = useState(""),
    [rate, setRate] = useState(String(loan.interestRate || 0));
  const [showSchedule, setShowSchedule] = useState(false);
  useEffect(
    () => setPayment(String(loan.scheduledEmi || "")),
    [loan.scheduledEmi],
  );
  useEffect(() => setRate(String(loan.interestRate || 0)), [loan.interestRate]);
  const principal = loanSummary(loan, rows).remainingPrincipal;
  const calculate = (...args: Parameters<typeof loanForecast>) => {
    try {
      return loanForecast(...args);
    } catch {
      return {
        error: "Enter valid non-negative forecast amounts.",
        schedule: [],
        months: 0,
        interest: 0,
        payoff: "",
      };
    }
  };
  const forecast = calculate(
    principal,
    Number(rate),
    Number(payment),
    Number(extra),
    todayIST(),
    Number(lump),
  );
  const baseline = calculate(principal, Number(rate), Number(payment));
  return (
    <details className="feature-details">
      <summary>Payoff forecast</summary>
      <div className="feature-body">
        <div className="form-grid">
          {[
            ["Monthly payment (₹)", payment, setPayment],
            ["Extra per month (₹)", extra, setExtra],
            ["One-time prepayment (₹)", lump, setLump],
            ["Forecast annual rate (%)", rate, setRate],
          ].map(([label, value, set]: any) => (
            <label className="field" key={label}>
              {label}
              <input
                aria-label={label}
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => set(event.target.value)}
              />
            </label>
          ))}
        </div>
        {forecast.error ? (
          <p role="status">{forecast.error}</p>
        ) : (
          <>
            <div className="mini-stats">
              <div>
                <small>Estimated payoff</small>
                <strong>
                  {new Intl.DateTimeFormat("en-IN", {
                    month: "short",
                    year: "numeric",
                  }).format(new Date(forecast.payoff + "T12:00:00Z"))}
                </strong>
                <small>{forecast.months} monthly payments</small>
              </div>
              <div>
                <small>Future interest</small>
                <strong>{money(forecast.interest)}</strong>
              </div>
              <div>
                <small>Interest saved vs base</small>
                <strong>
                  {money(Math.max(0, baseline.interest - forecast.interest))}
                </strong>
                <small>
                  {Math.max(0, baseline.months - forecast.months)} months
                  earlier
                </small>
              </div>
            </div>
            <details
              onToggle={(event) => setShowSchedule(event.currentTarget.open)}
            >
              <summary>Payment schedule</summary>
              <div className="compact-list scroll-list">
                {showSchedule &&
                  forecast.schedule.map((row, index) => (
                    <div key={index}>
                      <b>{row.date}</b>
                      <span>
                        Principal {money(row.principal)} · Interest{" "}
                        {money(row.interest)}
                      </span>
                      <small>Remaining {money(row.balance)}</small>
                    </div>
                  ))}
              </div>
            </details>
          </>
        )}
        <p className="credit-help">
          Estimate only: monthly reducing balance at the entered rate, starting
          next month. Excludes fees, daily accrual, unpaid interest and future
          rate changes. Prepayments here do not record repayments.
        </p>
      </div>
    </details>
  );
}
