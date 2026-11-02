"use client";
import { useState } from "react";
import { RecordData, money } from "../lib/finance";
import { reconcile, todayIST } from "../lib/planning";
import { duplicateKey } from "../lib/statement-import";
export default function Reconciliation({
  accounts,
  rows,
  settings,
  disabled,
  onSave,
}: {
  accounts: RecordData[];
  rows: RecordData[];
  settings: RecordData[];
  disabled: boolean;
  onSave: (r: any, op: string) => Promise<boolean>;
}) {
  const [accountId, setAccountId] = useState(""),
    [date, setDate] = useState(todayIST()),
    [amount, setAmount] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ record: any; op: string } | null>(
    null,
  );
  const account = accounts.find((a) => a.id === (accountId || accounts[0]?.id));
  const result =
    account && amount !== ""
      ? reconcile(account, rows, date, Number(amount))
      : null;
  const seen = new Set<string>();
  const duplicates = rows
    .filter(
      (row) =>
        row.status === "Active" &&
        row.account === account?.id &&
        row.date <= date,
    )
    .filter((row) => {
      const key = duplicateKey(row),
        found = seen.has(key);
      seen.add(key);
      return found;
    });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || !result || busy || disabled) return;
    const request = pending || {
      op: crypto.randomUUID(),
      record: {
        name: `${account.name} · ${date}`,
        kind: "reconciliation",
        accountId: account.id,
        asOf: date,
        statementBalance: Number(amount),
        ledgerBalance: result.ledger,
        difference: result.difference,
        notes,
      },
    };
    setPending(request);
    setBusy(true);
    setMessage("");
    try {
      if (await onSave(request.record, request.op)) {
        setMessage("Reconciliation saved to Google Sheets.");
        setPending(null);
      } else setMessage("Not confirmed. Retry the same reconciliation.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card feature-details">
      <summary>
        Reconcile bank statement{" "}
        <small>Compare a closing balance with your ledger</small>
      </summary>
      <div className="feature-body">
        <form onSubmit={submit}>
          <fieldset
            className="form-grid"
            disabled={disabled || busy || !!pending}
          >
            <label className="field">
              Reconcile account
              <select
                aria-label="Reconcile account"
                value={account?.id || ""}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                <option value="">Choose account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Statement date
              <input
                aria-label="Statement date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Statement closing balance (₹)
              <input
                aria-label="Statement closing balance"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Reconciliation notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </label>
          </fieldset>
          {account?.openingBalanceAsOf && date < account.openingBalanceAsOf ? (
            <p role="alert">
              Statement date is before this account’s opening balance. Choose a
              later date.
            </p>
          ) : (
            result && (
              <div className="mini-stats">
                <div>
                  <small>Ledger at statement date</small>
                  <strong>{money(result.ledger)}</strong>
                </div>
                <div>
                  <small>Statement balance</small>
                  <strong>{money(result.statementBalance)}</strong>
                </div>
                <div>
                  <small>
                    {result.difference === 0
                      ? "Matched"
                      : "Difference to investigate"}
                  </small>
                  <strong>{money(result.difference)}</strong>
                </div>
              </div>
            )
          )}
          <div className="row-actions">
            <button
              className="primary"
              disabled={
                disabled ||
                busy ||
                !result ||
                !!(
                  account?.openingBalanceAsOf &&
                  date < account.openingBalanceAsOf
                )
              }
            >
              {busy
                ? "Saving…"
                : pending
                  ? "Retry reconciliation"
                  : "Save reconciliation"}
            </button>
            {pending && !busy && (
              <button type="button" onClick={() => setPending(null)}>
                Start a new comparison
              </button>
            )}
          </div>
          {message && <p role="status">{message}</p>}
        </form>
        <p className="credit-help">
          Use the closing/book balance, not available balance after bank holds.
          A comparison never changes transactions or adjusts your opening
          balance.
        </p>
        {duplicates.length > 0 && (
          <details>
            <summary>{duplicates.length} possible duplicate entries</summary>
            <div className="compact-list">
              {duplicates.map((row) => (
                <div key={row.id}>
                  <b>
                    {row.date} · {row.description}
                  </b>
                  <span>{money(row.amount)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        <details>
          <summary>Saved comparisons</summary>
          <div className="compact-list">
            {settings
              .filter(
                (r) =>
                  r.kind === "reconciliation" &&
                  r.status === "Active" &&
                  r.accountId === account?.id,
              )
              .sort((a, b) => b.asOf.localeCompare(a.asOf))
              .map((r) => (
                <div key={r.id}>
                  <b>
                    {r.asOf} · {money(r.statementBalance)}
                  </b>
                  <span>
                    {r.difference === 0
                      ? "Matched"
                      : `Difference ${money(r.difference)}`}{" "}
                    · {r.notes}
                  </span>
                </div>
              ))}
          </div>
        </details>
      </div>
    </details>
  );
}
