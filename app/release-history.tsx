"use client";
import "./release-history.css";
import { useState } from "react";
type Release = {
  version: string;
  date: string;
  changes: { sha: string; date: string; title: string }[];
};
const history: Release[] = JSON.parse(
  process.env.NEXT_PUBLIC_RELEASE_HISTORY || "[]",
);
export default function ReleaseHistory() {
  const [query, setQuery] = useState(""),
    [visible, setVisible] = useState(6);
  const needle = query.trim().toLowerCase();
  const filtered = history.filter(
    (r) =>
      !needle ||
      r.version.toLowerCase().includes(needle) ||
      r.changes.some((c) => c.title.toLowerCase().includes(needle)),
  );
  return (
    <details className="release-history">
      <summary>
        Version history <span>{history.length} versions</span>
      </summary>
      <div className="release-history-content">
        <label className="field">
          Find a version or change
          <input
            aria-label="Search version history"
            type="search"
            placeholder="Search updates…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(6);
            }}
          />
        </label>
        {filtered.slice(0, visible).map((r, index) => (
          <details
            className="release-history-item"
            key={r.version}
            open={index === 0 && !needle ? true : undefined}
          >
            <summary>
              <strong>{r.version}</strong>
              <time dateTime={r.date}>{r.date}</time>
            </summary>
            <ul>
              {r.changes.map((c) => (
                <li key={c.sha}>
                  <span>{c.title}</span>
                  <a
                    href={`https://github.com/Ramasami/expense-tracker/commit/${c.sha}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View commit ${c.sha.slice(0, 7)}`}
                  >
                    {c.sha.slice(0, 7)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!filtered.length && <p>No matching updates.</p>}
        {filtered.length > visible && (
          <button onClick={() => setVisible((v) => v + 6)}>
            Show older versions
          </button>
        )}
      </div>
    </details>
  );
}
