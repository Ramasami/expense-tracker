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
          return (
            <article
              className="account-balance-card"
              key={account.id}
              aria-label={`${account.name} balance`}
            >
              <h3>{account.name}</h3>
              <strong>{money(ledger)}</strong>
              <small>
                Current balance · calculated from Sheet transactions
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
