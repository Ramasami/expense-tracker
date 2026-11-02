"use client";
import { useState } from "react";
import { RecordData, money } from "../lib/finance";
import { loanSummary } from "../lib/loans";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
type Props = {
  loans: RecordData[];
  rows: RecordData[];
  accounts: RecordData[];
  linkedAccounts: RecordData[];
  disabled: boolean;
  error: string;
  onSave: (record: any, op: string) => Promise<boolean>;
  onPay: (record: any, op: string) => Promise<boolean>;
};
export default function LoanTracker({
  loans,
  rows,
  accounts,
  linkedAccounts,
  disabled,
  error,
  onSave,
  onPay,
}: Props) {
  const [modal, setModal] = useState<{
    kind: "loan" | "payment";
    record: any;
    op: string;
    pending?: any;
  } | null>(null);
  const [saving, setSaving] = useState(false),
    [failed, setFailed] = useState(false);
  useDialogScrollLock(!!modal);
  const date = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const choose = (name: string, value: string) =>
    setModal((current) =>
      current
        ? { ...current, record: { ...current.record, [name]: value } }
        : null,
    );
  function openLoan(loan?: RecordData) {
    setFailed(false);
    setModal({
      kind: "loan",
      op: crypto.randomUUID(),
      record: loan
        ? { ...loan }
        : {
            name: "",
            principal: "",
            interestRate: "",
            openingPrincipalPaid: 0,
            openingInterestPaid: 0,
            accountId: linkedAccounts[0]?.id || "",
          },
    });
  }
  function openPay(loan: RecordData) {
    setFailed(false);
    setModal({
      kind: "payment",
      op: crypto.randomUUID(),
      record: {
        loanId: loan.id,
        account: accounts.some((account) => account.id === loan.accountId)
          ? loan.accountId
          : accounts[0]?.id || "",
        date: date(),
        principalPaid: "",
        interestPaid: "",
      },
    });
  }
  function close() {
    if (!saving) {
      setModal(null);
      setFailed(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!modal || saving) return;
    const record = modal.pending || { ...modal.record };
    if (!modal.pending) {
      if (modal.kind === "loan") {
        for (const key of [
          "principal",
          "interestRate",
          "openingPrincipalPaid",
          "openingInterestPaid",
        ])
          record[key] = Number(record[key] || 0);
        record.kind = "loan";
      } else {
        record.principalPaid = Number(record.principalPaid || 0);
        record.interestPaid = Number(record.interestPaid || 0);
        record.amount =
          Math.round((record.principalPaid + record.interestPaid) * 100) / 100;
        record.type = "Expense";
        record.expenseMode = "Debit";
        record.loanPayment = true;
        record.description = `Loan repayment · ${loans.find((loan) => loan.id === record.loanId)?.name || "loan"}`;
        record.payment = "Bank Transfer";
      }
    }
    setModal({ ...modal, pending: record });
    setSaving(true);
    setFailed(false);
    try {
      if (await (modal.kind === "loan" ? onSave : onPay)(record, modal.op))
        setModal(null);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }
  const field = (label: string, name: string, props: any = {}) => (
    <label className="field">
      {label}
      <input
        aria-label={label}
        value={modal?.record[name] ?? ""}
        onChange={(event) => choose(name, event.target.value)}
        {...props}
      />
    </label>
  );
  const options = (items: RecordData[]) =>
    items.map((account) => (
      <option key={account.id} value={account.id}>
        {account.name}
      </option>
    ));
  const selectedLoan = loans.find((loan) => loan.id === modal?.record.loanId);
  return (
    <section className="loan-tracker">
      <div className="section-heading">
        <div>
          <h2>Your loans</h2>
          <p>
            Track principal and actual interest paid. Repayments are confirmed
            in Google Sheets.
          </p>
        </div>
        <button
          className="primary"
          disabled={disabled}
          onClick={() => openLoan()}
        >
          Add loan
        </button>
      </div>
      <div className="entity-grid">
        {loans.map((loan) => {
          const summary = loanSummary(loan, rows);
          return (
            <article className="card loan-card" key={loan.id}>
              <h3>{loan.name}</h3>
              <p>
                {
                  accounts.find((account) => account.id === loan.accountId)
                    ?.name
                }{" "}
                · {Number(loan.interestRate)}% annual interest
              </p>
              {loan.allocationInferred && (
                <p className="statement-note">
                  Payment allocation inferred using interest-first repayment.
                  Interest-paid totals cover the supplied history only (from
                  November 2025); earlier interest is unknown. The earliest
                  split and switch-fee allocation are assumptions; original
                  lender entries are retained below.
                </p>
              )}
              <span className="stat-label">
                Remaining principal
                {loan.allocationInferred ? " (inferred)" : ""}
              </span>
              <strong className="entity-amount">
                {money(summary.remainingPrincipal)}
              </strong>
              <dl className="loan-details">
                <div>
                  <dt>Original principal</dt>
                  <dd>{money(loan.principal)}</dd>
                </div>
                <div>
                  <dt>Principal already paid</dt>
                  <dd>{money(summary.principalPaid)}</dd>
                </div>
                <div>
                  <dt>
                    Interest already paid
                    {loan.allocationInferred ? " (inferred, shown period)" : ""}
                  </dt>
                  <dd>{money(summary.interestPaid)}</dd>
                </div>
                <div>
                  <dt>Total repaid</dt>
                  <dd>{money(summary.totalPaid)}</dd>
                </div>
              </dl>
              {loan.statementSnapshot && (
                <div className="statement-snapshot">
                  <b>Lender reported outstanding</b>
                  <strong>{money(loan.statementSnapshot.outstanding)}</strong>
                  <small>
                    As of {loan.statementSnapshot.asOf}; includes{" "}
                    {money(loan.statementSnapshot.accruedInterest)} interest
                    charged after the last payment.
                  </small>
                  <p>
                    Sanctioned {money(loan.sanctionedAmount)} · Disbursed{" "}
                    {money(loan.principal)} · To be disbursed{" "}
                    {money(loan.undisbursedAmount)}
                    <br />
                    Scheduled EMI {money(loan.scheduledEmi)} on day{" "}
                    {loan.emiDay} · Remaining tenure{" "}
                    {loan.remainingTenureMonths} months
                    <br />
                    Fees paid {money(summary.feesPaid)}
                  </p>
                  <details>
                    <summary>Original lender history</summary>
                    <div className="loan-history">
                      {(loan.statementHistory || []).map(
                        (event: any, index: number) => (
                          <p key={index}>
                            {event.date} ·{" "}
                            {event.kind === "repayment"
                              ? "Payment"
                              : event.kind === "interestCharged"
                                ? "Interest charged"
                                : "Fee charged"}{" "}
                            {money(event.amount)} · Balance{" "}
                            {money(event.balanceAfter)}
                          </p>
                        ),
                      )}
                    </div>
                  </details>
                </div>
              )}
              <div className="row-actions">
                <button disabled={disabled} onClick={() => openLoan(loan)}>
                  Edit loan
                </button>
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() => openPay(loan)}
                >
                  Pay loan
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!loans.length && (
        <section className="card empty">
          No loans for these accounts. Add a loan with its original principal
          and any amounts already paid.
        </section>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loan-form-title"
          >
            <div className="card-heading">
              <h2 id="loan-form-title">
                {modal.kind === "loan"
                  ? modal.record.id
                    ? "Edit loan"
                    : "Add loan"
                  : "Record loan payment"}
              </h2>
              <button
                type="button"
                aria-label="Close loan form"
                onClick={close}
                disabled={saving}
              >
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              <fieldset
                className="form-grid"
                disabled={saving || !!modal.pending || disabled}
              >
                {modal.kind === "loan" ? (
                  <>
                    {field("Loan name", "name", {
                      required: true,
                      maxLength: 120,
                    })}
                    <label className="field">
                      Linked account
                      <select
                        aria-label="Linked account"
                        value={modal.record.accountId}
                        onChange={(event) =>
                          choose("accountId", event.target.value)
                        }
                        required
                      >
                        <option value="">Select account…</option>
                        {options(accounts)}
                      </select>
                    </label>
                    {field("Original principal (₹)", "principal", {
                      type: "number",
                      min: "0.01",
                      step: "0.01",
                      required: true,
                    })}
                    {field("Annual interest rate (%)", "interestRate", {
                      type: "number",
                      min: "0",
                      max: "1000",
                      step: "0.001",
                      required: true,
                    })}
                    {field(
                      "Principal paid before tracking (₹)",
                      "openingPrincipalPaid",
                      { type: "number", min: "0", step: "0.01" },
                    )}
                    {field(
                      "Interest paid before tracking (₹)",
                      "openingInterestPaid",
                      { type: "number", min: "0", step: "0.01" },
                    )}
                  </>
                ) : (
                  <>
                    <label className="field">
                      Loan
                      <input value={selectedLoan?.name || ""} readOnly />
                    </label>
                    <label className="field">
                      From account
                      <select
                        aria-label="From account"
                        value={modal.record.account}
                        onChange={(event) =>
                          choose("account", event.target.value)
                        }
                        required
                      >
                        <option value="">Select paying account…</option>
                        {options(accounts)}
                      </select>
                    </label>
                    {field("Payment date", "date", {
                      type: "date",
                      required: true,
                    })}
                    {field("Principal paid (₹)", "principalPaid", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      max: selectedLoan
                        ? loanSummary(selectedLoan, rows).remainingPrincipal
                        : undefined,
                      required: true,
                    })}
                    {field("Interest paid (₹)", "interestPaid", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      required: true,
                    })}
                  </>
                )}
              </fieldset>
              {modal.kind === "payment" ? (
                <div className="credit-summary">
                  <div>
                    <small>Remaining principal</small>
                    <strong>
                      {money(
                        selectedLoan
                          ? loanSummary(selectedLoan, rows).remainingPrincipal
                          : 0,
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>Payment total</small>
                    <strong>
                      {money(
                        Number(modal.record.principalPaid || 0) +
                          Number(modal.record.interestPaid || 0),
                      )}
                    </strong>
                  </div>
                  <p className="credit-help">
                    Enter the actual principal and interest split from your
                    lender. Principal reduces your loan balance; interest is an
                    expense. Both amounts leave the paying account.
                  </p>
                </div>
              ) : (
                <p className="credit-help">
                  Already-paid amounts are opening totals only; they do not
                  create new cash transactions. Add new repayments using Pay
                  loan. The annual rate is recorded for reference.
                </p>
              )}
              {failed && (
                <p className="alert" role="alert">
                  {error ||
                    "Save not confirmed. Retry the same request to check its status."}
                </p>
              )}
              <div className="form-footer">
                <button type="button" disabled={saving} onClick={close}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={saving || (!modal.pending && disabled)}
                >
                  {saving
                    ? "Saving…"
                    : modal.pending
                      ? "Retry save"
                      : modal.kind === "loan"
                        ? "Save loan"
                        : "Save loan payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
