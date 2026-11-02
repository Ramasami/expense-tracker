"use client";
import { RecordData, money, balance } from "../lib/finance";
export default function AccountBalances({
  accounts,
  rows,
  stale,
}: {
  accounts: RecordData[];
  rows: RecordData[];
  stale: boolean;
}) {
  if (!accounts.length) return null;
  return (
    <section className="account-balances" aria-label="Account balances">
      <div className="account-balances-heading">
        <h2>Account balances</h2>
        <small>
          {stale ? "Cached · sync required" : "Sheet balances"} · independent of
          report date filters
        </small>
      </div>
      <div className="account-balances-grid">
        {accounts.map((account) => {
          const ledger = Math.round(balance(account, rows) * 100) / 100;
          const confirmation = account.balanceConfirmation;
          const confirmed =
            confirmation &&
            typeof confirmation.amount === "number" &&
            Number.isFinite(confirmation.amount);
          const difference = confirmed
            ? Math.round((ledger - confirmation.amount) * 100) / 100
            : 0;
          const withheld =
            confirmed && Number.isFinite(confirmation.withheldAmount)
              ? confirmation.withheldAmount
              : 0;
          const unexplained = Math.round((difference - withheld) * 100) / 100;
          return (
            <article
              className={
                "account-balance-card" +
                (unexplained ? " needs-reconciliation" : "")
              }
              key={account.id}
              aria-label={`${account.name} balance`}
            >
              <h3>{account.name}</h3>
              <strong>{money(confirmed ? confirmation.amount : ledger)}</strong>
              {confirmed ? (
                <>
                  <small>Available · confirmed {confirmation.asOf}</small>
                  <span>Ledger: {money(ledger)}</span>
                  {withheld > 0 && (
                    <p>
                      Loan amount withheld: {money(withheld)} · owner confirmed
                    </p>
                  )}
                  {unexplained !== 0 ? (
                    <p className="balance-difference">
                      Ledger is {money(Math.abs(unexplained))}{" "}
                      {unexplained > 0 ? "higher" : "lower"} than the confirmed
                      balance{withheld ? " after withholding" : ""}.
                      Reconciliation needed.
                    </p>
                  ) : (
                    <p className="balance-matched">
                      {withheld
                        ? "Ledger less withholding matches available balance"
                        : "Matches the ledger"}
                    </p>
                  )}
                </>
              ) : (
                <small>Calculated from Sheet transactions</small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
