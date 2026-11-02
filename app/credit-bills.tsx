"use client";
import { useEffect, useState } from "react";
import { RecordData, money } from "../lib/finance";
import { allocateCredit, creditTotal, unpaidCredit } from "../lib/credit";
import { billingCycle, todayIST } from "../lib/planning";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";

type Props = {
  rows: RecordData[];
  accounts: RecordData[];
  destinations: RecordData[];
  label: (account: RecordData) => string;
  disabled: boolean;
  error: string;
  onPay: (record: any, operationId: string) => Promise<boolean>;
};
export default function CreditBills({
  rows,
  accounts,
  destinations,
  label,
  disabled,
  error,
  onPay,
}: Props) {
  const [destination, setDestination] = useState("");
  const [cardId, setCardId] = useState("");
  const [cycleFilter, setCycleFilter] = useState("All");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [source, setSource] = useState("");
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{
    record: any;
    operationId: string;
  } | null>(null);
  const [confirmedUnpaid, setConfirmedUnpaid] = useState(false);
  const [failure, setFailure] = useState("");
  useDialogScrollLock(paying);
  useEffect(() => {
    if (!destinations.some((account) => account.id === destination)) {
      setDestination(destinations[0]?.id || "");
      setExcluded([]);
      setCardId("");
      setCycleFilter("All");
      setPaymentAmount("");
    }
  }, [destinations, destination]);
  const accountCards =
    accounts.find((account) => account.id === destination)?.creditCards || [];
  const allCharges = unpaidCredit(rows, destination, true).filter(
    (row) => !cardId || row.creditCardId === cardId,
  );
  const charges = allCharges.filter(
    (row) =>
      cycleFilter === "All" ||
      billingCycle(
        row.date,
        accountCards.find((card: any) => card.id === row.creditCardId),
      )?.status === cycleFilter,
  );
  const selected = charges.filter((row) => !excluded.includes(row.id));
  const unknownSelected = selected.filter(
    (row) => row.settlementStatus === "Unknown",
  );
  const needsConfirmation = unknownSelected.length > 0 && !confirmedUnpaid;
  useEffect(
    () => setConfirmedUnpaid(false),
    [destination, cardId, excluded, rows, cycleFilter],
  );
  const amount =
    pending?.record.amount ??
    (paymentAmount ? Number(paymentAmount) : creditTotal(selected));
  const sources = accounts;
  const options = (items: RecordData[]) =>
    items.map((account) => (
      <option key={account.id} value={account.id}>
        {label(account)}
      </option>
    ));
  function choose(value: string) {
    setDestination(value);
    if (source === value)
      setSource(accounts.find((account) => account.id !== value)?.id || "");
    setCardId("");
    setExcluded([]);
    setPaymentAmount("");
  }
  function close() {
    if (!saving) {
      setPaying(false);
      setPending(null);
      setFailure("");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || (!pending && needsConfirmation)) return;
    let allocations: Record<string, number>;
    try {
      allocations =
        pending?.record.creditAllocations || allocateCredit(selected, amount);
    } catch (error) {
      setFailure((error as Error).message);
      return;
    }
    const request = pending || {
      operationId: crypto.randomUUID(),
      record: {
        date,
        account: source,
        toAccount: destination,
        amount,
        creditAllocations: allocations,
        type: "Transfer",
        creditPayment: true,
        paidTransactionIds: Object.keys(allocations),
        confirmedUnpaidTransactionIds: unknownSelected.map((row) => row.id),
        description: `Credit card bill payment · ${accounts.find((account) => account.id === destination)?.name || "account"}`,
        payment: "Bank Transfer",
        expenseMode: "Debit",
      },
    };
    setPending(request);
    setSaving(true);
    setFailure("");
    try {
      if (await onPay(request.record, request.operationId)) {
        setPaying(false);
        setPending(null);
        setExcluded([]);
        setPaymentAmount("");
      } else
        setFailure(
          "Payment not confirmed. Retry the same payment to check its status, or close and refresh before starting again.",
        );
    } catch (problem) {
      setFailure((problem as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const list = (
    <div className="credit-charge-list">
      <label className="credit-select-all">
        <input
          type="checkbox"
          disabled={saving || !!pending || disabled}
          checked={charges.length > 0 && selected.length === charges.length}
          onChange={(event) =>
            setExcluded(
              event.target.checked ? [] : charges.map((row) => row.id),
            )
          }
        />
        Select all listed transactions
      </label>
      {charges.map((row) => (
        <label className="credit-charge" key={row.id}>
          <input
            type="checkbox"
            disabled={saving || !!pending || disabled}
            checked={!excluded.includes(row.id)}
            onChange={(event) =>
              setExcluded(
                event.target.checked
                  ? excluded.filter((id) => id !== row.id)
                  : [...excluded, row.id],
              )
            }
          />
          <span>
            <b>{row.description}</b>
            <small>
              {row.amount < row.originalAmount &&
                `Part paid · original ${money(row.originalAmount)} · `}
              {(() => {
                const cycle = billingCycle(
                  row.date,
                  accountCards.find(
                    (card: any) => card.id === row.creditCardId,
                  ),
                );
                return cycle
                  ? `${cycle.status}${cycle.due ? ` · due ${cycle.due}` : ""} · `
                  : "";
              })()}
              {row.settlementStatus === "Unknown"
                ? "Confirm unpaid · "
                : "Unpaid · "}
              {row.date} ·{" "}
              {row.creditCardName || row.tag || "Credit card expense"}
            </small>
          </span>
          <strong>{money(row.amount)}</strong>
        </label>
      ))}
      {!charges.length && (
        <p className="empty">
          No outstanding credit card transactions recorded for this account.
        </p>
      )}
    </div>
  );
  const summary = (
    <div className="credit-summary">
      <div>
        <small>Listed charges · {charges.length} transactions</small>
        <strong>{money(creditTotal(charges))}</strong>
      </div>
      <div>
        <small>Selected · {selected.length} transactions</small>
        <strong>{money(amount)}</strong>
      </div>
    </div>
  );
  return (
    <section className="card credit-bills">
      <div className="card-heading">
        <div>
          <h2>Credit card charges to pay</h2>
          <p>
            Select the charges you want to pay. Paid charges leave this list
            after Google Sheets confirms the payment.
          </p>
        </div>
      </div>
      <div className="credit-bills-content">
        <label className="field">
          Credit card account
          <select
            aria-label="Credit card account"
            value={destination}
            onChange={(event) => choose(event.target.value)}
          >
            {!destinations.length && (
              <option value="">No active accounts</option>
            )}
            {options(destinations)}
          </select>
        </label>
        {(
          accounts.find((account) => account.id === destination)?.creditCards ||
          []
        )
          .filter(
            (card: any) =>
              card.statementSnapshot && (!cardId || cardId === card.id),
          )
          .map((card: any) => (
            <details className="statement-snapshot" key={card.id}>
              <summary>
                {card.name} · reported{" "}
                {money(card.statementSnapshot.reportedBalance)}
              </summary>
              <small>
                Reported outstanding · {card.statementSnapshot.reportedOn}.
                Transaction pages through{" "}
                {card.statementSnapshot.coverageThrough}.
              </small>
              <p>
                Partial statement: historical purchase settlement is unknown.
                Review the listed purchases and confirm which are still unpaid
                before paying. The reported balance may include transactions
                outside these pages.
              </p>
            </details>
          ))}
        {!paying && (
          <label className="field">
            Credit card
            <select
              aria-label="Credit card filter"
              value={cardId}
              onChange={(event) => {
                setCardId(event.target.value);
                setExcluded([]);
              }}
            >
              <option value="">All credit cards</option>
              {(
                accounts.find((account) => account.id === destination)
                  ?.creditCards || []
              ).map((card: any) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!paying && (
          <>
            <div className="cycle-summary" aria-label="Billing cycle summary">
              {(["Billed", "Unbilled", "Overdue"] as const).map((status) => (
                <button
                  key={status}
                  aria-pressed={cycleFilter === status}
                  onClick={() => {
                    setCycleFilter(cycleFilter === status ? "All" : status);
                    setExcluded([]);
                  }}
                >
                  <small>{status}</small>
                  <strong>
                    {money(
                      creditTotal(
                        allCharges.filter(
                          (row) =>
                            billingCycle(
                              row.date,
                              accountCards.find(
                                (card: any) => card.id === row.creditCardId,
                              ),
                            )?.status === status,
                        ),
                      ),
                    )}
                  </strong>
                </button>
              ))}
            </div>
            {allCharges.some(
              (row) =>
                !billingCycle(
                  row.date,
                  accountCards.find(
                    (card: any) => card.id === row.creditCardId,
                  ),
                ),
            ) && (
              <p className="credit-help">
                Set statement and due days in Accounts → Edit account → Billing
                cycle to classify all charges.
              </p>
            )}
            {cycleFilter !== "All" && (
              <button
                className="text-button"
                onClick={() => setCycleFilter("All")}
              >
                Show all cycles
              </button>
            )}
            {summary}
            {list}
            {unknownSelected.length > 0 && (
              <label className="credit-select-all">
                <input
                  type="checkbox"
                  checked={confirmedUnpaid}
                  disabled={disabled}
                  onChange={(event) => setConfirmedUnpaid(event.target.checked)}
                />
                I confirm the selected statement charges are still unpaid
              </label>
            )}
            <div className="credit-pay-action">
              <button
                className="primary"
                disabled={
                  disabled ||
                  needsConfirmation ||
                  !selected.length ||
                  !sources.length
                }
                onClick={() => {
                  setSource(sources[0]?.id || "");
                  setPending(null);
                  setPaymentAmount("");
                  setFailure("");
                  setPaying(true);
                }}
              >
                Pay selected · {money(creditTotal(selected))}
              </button>
              {!sources.length && <p>Add another account to pay this bill.</p>}
            </div>
          </>
        )}
        <p className="credit-help">
          Cycle dates are estimated from transaction dates and your configured
          days; check the bank statement for posting differences. Debit expenses
          reduce cash immediately. Credit card expenses stay here until paid;
          the bill payment reduces the paying account’s cash once.
        </p>
      </div>
      {paying && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="modal credit-payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credit-payment-title"
          >
            <div className="modal-heading">
              <h2 id="credit-payment-title">Pay credit card bill</h2>
              <button
                type="button"
                aria-label="Close credit payment"
                disabled={saving}
                onClick={close}
              >
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              <fieldset
                className="form-grid"
                disabled={saving || !!pending || disabled}
              >
                <label className="field">
                  From account
                  <select
                    aria-label="From account"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    required
                  >
                    <option value="">Select paying account…</option>
                    {options(sources)}
                  </select>
                </label>
                <label className="field">
                  To account
                  <select
                    aria-label="To account"
                    value={destination}
                    onChange={(event) => choose(event.target.value)}
                    required
                  >
                    {options(destinations)}
                  </select>
                </label>
                <label className="field">
                  Payment date
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </label>
              </fieldset>
              <label className="field">
                Payment amount (₹)
                <input
                  aria-label="Credit payment amount"
                  type="number"
                  min="0.01"
                  max={creditTotal(selected)}
                  step="0.01"
                  value={paymentAmount || creditTotal(selected)}
                  disabled={saving || !!pending || disabled}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </label>
              <p className="credit-help">
                Record the amount paid at your bank. Partial payments apply
                oldest-first; the remaining charges stay unpaid. This does not
                send money.
              </p>
              {summary}
              {list}
              {failure && (
                <p className="error" role="alert">
                  {error || failure}
                </p>
              )}
              <div className="form-footer">
                <button type="button" onClick={close} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={
                    saving ||
                    (!pending &&
                      (disabled || needsConfirmation || !selected.length))
                  }
                >
                  {saving
                    ? "Saving payment…"
                    : pending
                      ? "Retry payment"
                      : amount < creditTotal(selected)
                        ? `Record partial payment ${money(amount)}`
                        : `Pay ${money(amount)} and mark selected paid`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
