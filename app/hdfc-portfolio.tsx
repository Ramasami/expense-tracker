"use client";
import { useEffect, useState } from "react";
import { RefreshCw, BriefcaseBusiness } from "lucide-react";
import {
  fetchHDFCPortfolio,
  portfolioTotals,
  type HDFCPortfolio,
} from "../lib/hdfc-portfolio";
import { money } from "../lib/finance";
import "./hdfc-portfolio.css";
export default function HDFCPortfolioView({
  disabled,
  onSetup,
  ownerName,
}: {
  disabled: boolean;
  onSetup: () => void;
  ownerName: string;
}) {
  const [data, setData] = useState<HDFCPortfolio | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("value"),
    [exchange, setExchange] = useState("");
  async function load() {
    if (disabled || busy) return;
    setBusy(true);
    setError("");
    try {
      setData(await fetchHDFCPortfolio());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    if (disabled) return;
    setBusy(true);
    fetchHDFCPortfolio()
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [disabled]);
  const totals = portfolioTotals(data?.holdings || []);
  const rows = (data?.holdings || [])
    .filter(
      (h) =>
        (!exchange || h.exchange === exchange) &&
        (!search ||
          `${h.name} ${h.isin} ${h.sector}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "gain"
          ? (b.unrealized ?? -Infinity) - (a.unrealized ?? -Infinity)
          : sort === "loss"
            ? (a.unrealized ?? Infinity) - (b.unrealized ?? Infinity)
            : (b.closingValue ?? -Infinity) - (a.closingValue ?? -Infinity),
    );
  return (
    <section
      className="card hdfc-portfolio"
      aria-label="HDFC Securities portfolio"
    >
      <div className="hdfc-portfolio-heading">
        <div>
          <span className="hdfc-kicker">
            <BriefcaseBusiness size={14} />
            HDFC SECURITIES
          </span>
          <h2>Your broker portfolio</h2>
          <p>
            {ownerName}’s signed-in connection · separate from Sheet
            contribution filters
          </p>
        </div>
        <button
          aria-label="Refresh HDFC portfolio"
          disabled={disabled || busy || !data?.status.connected}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>
      {busy && <p role="status">Fetching holdings from HDFC…</p>}
      {(error || disabled) && (
        <p role="alert" className="hdfc-error">
          {disabled
            ? "Offline or Sheet sync required. Reconnect to refresh HDFC."
            : error}
          {data?.fetchedAt ? " Previously fetched values below are stale." : ""}
        </p>
      )}
      {!busy && !error && !data?.status.connected && (
        <div className="hdfc-empty">
          <BriefcaseBusiness size={30} />
          <h3>See your holdings here</h3>
          <p>Connect your InvestRight developer app in Settings.</p>
          <button disabled={disabled} onClick={onSetup}>
            Set up HDFC connection
          </button>
        </div>
      )}
      {data?.fetchedAt && (
        <>
          <div className="hdfc-valuations">
            <div>
              <span>
                {totals.partialCost ? "Known invested value" : "Invested value"}
              </span>
              <strong>{money(totals.invested)}</strong>
            </div>
            <div>
              <span>
                {totals.partialValue
                  ? "Known closing value"
                  : "Closing-price value"}
              </span>
              <strong>{money(totals.value)}</strong>
            </div>
            <div>
              <span>
                {totals.partialGain ? "Known unrealized P&L" : "Unrealized P&L"}
              </span>
              <strong
                className={totals.gain < 0 ? "hdfc-negative" : "hdfc-positive"}
              >
                {money(totals.gain)}
              </strong>
            </div>
          </div>
          <p className="hdfc-asof">
            Fetched {new Date(data.fetchedAt).toLocaleString("en-IN")} · valued
            at HDFC’s returned closing prices, not live quotes.
            {(totals.partialCost || totals.partialValue) &&
              " Some prices are missing; totals cover known values only."}
          </p>
          <div className="hdfc-list-controls">
            <label className="field">
              Find holdings
              <input
                type="search"
                aria-label="Search HDFC holdings"
                placeholder="Company, ISIN or sector"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="field">
              Exchange
              <select
                aria-label="HDFC exchange filter"
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
              >
                <option value="">All exchanges</option>
                {[...new Set(data.holdings.map((h) => h.exchange))]
                  .filter(Boolean)
                  .sort()
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
            </label>
            <label className="field">
              Sort by
              <select
                aria-label="HDFC holdings sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="value">Largest value</option>
                <option value="name">Name A–Z</option>
                <option value="gain">Highest gain</option>
                <option value="loss">Largest loss</option>
              </select>
            </label>
          </div>
          <div className="hdfc-holdings" role="list">
            {rows.map((h, i) => (
              <article role="listitem" key={`${h.isin}:${h.exchange}:${i}`}>
                <div>
                  <h3>{h.name}</h3>
                  <small>
                    {[h.exchange, h.sector, h.isin].filter(Boolean).join(" · ")}
                  </small>
                  <span>
                    {h.quantity.toLocaleString("en-IN")} units · Avg{" "}
                    {h.averagePrice === null
                      ? "unavailable"
                      : money(h.averagePrice)}
                  </span>
                </div>
                <div>
                  <strong>
                    {h.closingValue === null
                      ? "Price unavailable"
                      : money(h.closingValue)}
                  </strong>
                  <span
                    className={
                      (h.unrealized ?? 0) < 0
                        ? "hdfc-negative"
                        : "hdfc-positive"
                    }
                  >
                    {h.unrealized === null
                      ? "P&L unavailable"
                      : `${h.unrealized >= 0 ? "+" : ""}${money(h.unrealized)}`}
                  </span>
                  <small>
                    Invested{" "}
                    {h.investedValue === null
                      ? "unavailable"
                      : money(h.investedValue)}
                  </small>
                </div>
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="hdfc-empty">
              {data.holdings.length
                ? "No matching holdings."
                : "HDFC returned no delivery holdings."}
            </p>
          )}
          <small>
            {rows.length} of {data.holdings.length} holdings · totals include
            the full fetched portfolio
          </small>
        </>
      )}
      {error && (
        <div className="hdfc-connection-actions">
          <button disabled={disabled || busy} onClick={() => void load()}>
            Retry
          </button>
          <button disabled={disabled} onClick={onSetup}>
            Manage HDFC connection
          </button>
        </div>
      )}
    </section>
  );
}
