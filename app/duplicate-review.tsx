"use client";
import { useMemo, useState } from "react";
import { money, type RecordData } from "../lib/finance";
import { duplicatePairs } from "../lib/smart-finance";
import "./smart-finance.css";
export default function DuplicateReview({
  rows,
  accounts,
  onReview,
}: {
  rows: RecordData[];
  accounts: RecordData[];
  onReview: (record: RecordData) => void;
}) {
  const pairs = useMemo(() => duplicatePairs(rows), [rows]);
  const [visible, setVisible] = useState(5);
  return (
    <details className="duplicate-review">
      <summary>
        Check possible duplicates{" "}
        <span>{pairs.length === 50 ? "50+" : pairs.length}</span>
      </summary>
      <p className="smart-caption">
        Suggestions only. Repeated purchases can be legitimate. Review both
        entries before using the normal delete action.
      </p>
      {!pairs.length && (
        <p>No likely duplicates in this owner, account and date selection.</p>
      )}
      {pairs.slice(0, visible).map(({ first, second, reason }) => (
        <article className="duplicate-pair" key={`${first.id}:${second.id}`}>
          <small>{reason}</small>
          {[first, second].map((r) => (
            <button key={r.id} onClick={() => onReview(r)}>
              <span>
                <b>{r.description}</b>
                <small>
                  {r.date} ·{" "}
                  {accounts.find((a) => a.id === r.account)?.name || r.account}
                </small>
              </span>
              <strong>{money(r.amount)}</strong>
              <span className="smart-caption">Review</span>
            </button>
          ))}
        </article>
      ))}
      {pairs.length > visible && (
        <button className="outline" onClick={() => setVisible((n) => n + 10)}>
          Show more pairs
        </button>
      )}
    </details>
  );
}
