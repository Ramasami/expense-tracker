"use client";
import ListControls from "./list-controls";
import { useState } from "react";
import { Snapshot, RecordData, money } from "../lib/finance";
const groups: Record<string, string> = {
  transactions: "Transactions",
  accounts: "Accounts",
  budgets: "Budgets",
  tags: "Expense tags",
  settings: "Loans & comparisons",
  goals: "Goals",
  recurring: "Schedules",
  holdings: "Investments",
};
export default function Recovery({
  data,
  disabled,
  onRestore,
  onOpen,
}: {
  data: Snapshot;
  disabled: boolean;
  onOpen: () => void;
  onRestore: (entity: string, row: RecordData, op: string) => Promise<boolean>;
}) {
  const [listSort, setListSort] = useState("newest"),
    [statusFilter, setStatusFilter] = useState("");
  const [entity, setEntity] = useState("transactions"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
  const records = data[entity as keyof Snapshot]
    .filter(
      (r) =>
        ["Deleted", "Archived"].includes(r.status) &&
        (!statusFilter || r.status === statusFilter) &&
        (!search ||
          `${r.name || r.description} ${r.updatedBy || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      listSort === "name"
        ? String(a.name || a.description).localeCompare(
            String(b.name || b.description),
          )
        : listSort === "oldest"
          ? String(a.updatedAt).localeCompare(String(b.updatedAt))
          : String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  async function restore(row: RecordData) {
    setBusy(row.id);
    try {
      setMessage(
        (await onRestore(entity, row, `restore-${row.id}-${row.version}`))
          ? "Restored to Google Sheets."
          : "Restore not confirmed. Refresh and retry; linked records may need restoring first.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <details
      className="card feature-details"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen();
      }}
    >
      <summary>
        Recently deleted & archived{" "}
        <small>Restore records without losing their history</small>
      </summary>
      <div className="feature-body">
        <ListControls
          label="deleted records"
          search={search}
          onSearch={setSearch}
          sort={listSort}
          onSort={setListSort}
          sorts={[
            ["newest", "Most recently changed"],
            ["oldest", "Oldest changes first"],
            ["name", "Name A–Z"],
          ]}
        >
          <label className="field">
            Record status
            <select
              aria-label="Recovery status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Deleted and archived</option>
              <option value="Deleted">Deleted</option>
              <option value="Archived">Archived</option>
            </select>
          </label>
        </ListControls>
        <div className="filter-toolbar">
          <select
            aria-label="Recovery category"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            {Object.entries(groups).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="compact-list">
          {records.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.name || row.description}</b>
                <small>
                  {row.status} · {row.updatedAt?.slice(0, 10) || "Date unknown"}{" "}
                  · {row.updatedBy || "Unknown editor"}
                </small>
                {row.amount && <span>{money(Number(row.amount))}</span>}
              </div>
              <button
                disabled={disabled || !!busy}
                onClick={() => restore(row)}
              >
                {busy === row.id ? "Restoring…" : "Restore"}
              </button>
            </article>
          ))}
        </div>
        {!records.length && (
          <p className="empty">
            No deleted or archived records in this category.
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <p className="credit-help">
          Deletion is recoverable; there is no automatic purge. Restoring a
          payment rechecks its linked charges and loan balance. Files explicitly
          deleted from Drive are not restored by restoring a transaction.
        </p>
      </div>
    </details>
  );
}
