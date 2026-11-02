"use client";
import { useState } from "react";
import { RecordData, money } from "../lib/finance";
import { accountOwners } from "../lib/owners";
import BudgetTagPicker from "./budget-tag-picker";
import { budgetTagIds, monthlySpending, todayIST } from "../lib/planning";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
export default function MonthlyBudgets({
  budgets,
  rows,
  tags,
  accounts,
  person,
  owners,
  disabled,
  onSave,
  onDelete,
}: {
  budgets: RecordData[];
  rows: RecordData[];
  tags: RecordData[];
  accounts: RecordData[];
  person: string;
  owners: RecordData[];
  disabled: boolean;
  onSave: (record: any, op: string) => Promise<boolean>;
  onDelete: (record: RecordData) => void;
}) {
  const [month, setMonth] = useState(todayIST().slice(0, 7)),
    [modal, setModal] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [validation, setValidation] = useState(""),
    [query, setQuery] = useState(""),
    [tagFilter, setTagFilter] = useState(""),
    [sort, setSort] = useState("usage");
  useDialogScrollLock(!!modal);
  const shown = budgets.filter(
    (b) =>
      b.status === "Active" &&
      (!b.month || b.month === month) &&
      (!b.person ||
        b.person === "Combined" ||
        person === "Combined" ||
        b.person === person) &&
      (!b.accountId || accounts.some((a) => a.id === b.accountId)) &&
      (!query ||
        `${b.name} ${budgetTagIds(b)
          .map((id) => tags.find((t) => t.id === id)?.name || "")
          .join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!tagFilter ||
        !budgetTagIds(b).length ||
        budgetTagIds(b).includes(tagFilter)),
  );
  const allowedFor = (b: RecordData) =>
    accounts
      .filter(
        (a) =>
          !b.person ||
          b.person === "Combined" ||
          accountOwners(a, owners).includes(
            owners.find((o) => o.name === b.person)?.id || "",
          ),
      )
      .map((a) => a.id);
  shown.sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "remaining"
        ? a.amount -
          monthlySpending(a, rows, month, allowedFor(a)) -
          (b.amount - monthlySpending(b, rows, month, allowedFor(b)))
        : sort === "limit"
          ? b.amount - a.amount
          : monthlySpending(b, rows, month, allowedFor(b)) / Number(b.amount) -
            monthlySpending(a, rows, month, allowedFor(a)) / Number(a.amount),
  );
  const total = shown.reduce((s, b) => s + Number(b.amount), 0);
  const spent = shown.reduce(
    (s, b) => s + monthlySpending(b, rows, month, allowedFor(b)),
    0,
  );
  function open(record?: RecordData) {
    setFailed(false);
    setValidation("");
    setModal({
      record: record || {
        name: "",
        amount: "",
        tagId: "",
        accountId: "",
        month,
        person,
      },
      op: crypto.randomUUID(),
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || disabled) return;
    const record = modal.pending || {
      ...modal.record,
      ...Object.fromEntries(new FormData(e.currentTarget)),
    };
    if (!modal.pending) {
      const form = new FormData(e.currentTarget);
      record.tagIds =
        record.tagScope === "selected" ? form.getAll("tagIds").map(String) : [];
      record.tagId = "";
      if (record.tagScope === "selected" && !record.tagIds.length) {
        setValidation(
          "Choose at least one expense tag, or choose All expense tags.",
        );
        return;
      }
    }
    record.amount = Number(record.amount);
    record.month = record.repeat === "on" ? "" : record.month;
    delete record.repeat;
    setModal({ ...modal, pending: record });
    setBusy(true);
    try {
      if (await onSave(record, modal.op)) setModal(null);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="monthly-budgets">
      <div className="section-heading">
        <div>
          <h2>Monthly budgets</h2>
          <p>
            Track purchases when you spend; card bill payments are not counted
            twice.
          </p>
        </div>
        <div className="row-actions">
          <input
            aria-label="Budget month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            className="primary"
            disabled={disabled}
            onClick={() => open()}
          >
            Add budget
          </button>
        </div>
      </div>
      <div className="mini-stats card">
        <div>
          <small>Budget limits</small>
          <strong>{money(total)}</strong>
        </div>
        <div>
          <small>Spent against limits</small>
          <strong>{money(spent)}</strong>
        </div>
        <div>
          <small>Remaining</small>
          <strong>{money(total - spent)}</strong>
        </div>
      </div>
      <p className="credit-help">
        Overlapping budgets count the same purchase in each matching limit.
      </p>
      <div className="list-tools">
        <input
          aria-label="Search budgets"
          type="search"
          placeholder="Search budgets or tags"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <details>
          <summary>Sort & filter</summary>
          <div className="form-grid">
            <label className="field">
              Sort budgets
              <select
                aria-label="Sort budgets"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="usage">Highest usage first</option>
                <option value="name">Name A–Z</option>
                <option value="remaining">Least remaining first</option>
                <option value="limit">Largest limit first</option>
              </select>
            </label>
            <label className="field">
              Budget tag filter
              <select
                aria-label="Budget tag filter"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All tags</option>
                {tags
                  .filter((t) => t.type === "Expense" && t.status === "Active")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </details>
      </div>
      <div className="entity-grid">
        {shown.map((b) => {
          const used = monthlySpending(b, rows, month, allowedFor(b)),
            left = Number(b.amount) - used;
          return (
            <article className="card entity-card" key={b.id}>
              <div className="card-heading">
                <h3>{b.name}</h3>
                <span className="chip">
                  {left < 0
                    ? "Over budget"
                    : used >= Number(b.amount) * 0.8
                      ? "Near limit"
                      : "On track"}
                </span>
              </div>
              <strong className="entity-amount">
                {money(used)} <small>of {money(Number(b.amount))}</small>
              </strong>
              <progress
                value={Math.min(used, Number(b.amount))}
                max={Number(b.amount)}
              />
              <p>
                {left < 0
                  ? `${money(-left)} over budget`
                  : `${money(left)} left to spend`}
              </p>
              <small>
                {b.month || "Repeats monthly"} ·{" "}
                {budgetTagIds(b).length
                  ? budgetTagIds(b)
                      .map(
                        (id) =>
                          tags.find((t) => t.id === id)?.name || "Unknown tag",
                      )
                      .join(", ")
                  : "All expense tags"}{" "}
                ·{" "}
                {accounts.find((a) => a.id === b.accountId)?.name ||
                  "All selected owner accounts"}
              </small>
              <div className="row-actions">
                <button disabled={disabled} onClick={() => open(b)}>
                  Edit budget
                </button>
                <button disabled={disabled} onClick={() => onDelete(b)}>
                  Delete budget
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <div className="card empty">
          No budgets for this month. Add a category or an account limit.
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.record.id ? "Edit budget" : "Add budget"}
          >
            <div className="card-heading">
              <h2>{modal.record.id ? "Edit budget" : "Add budget"}</h2>
              <button
                type="button"
                disabled={busy}
                aria-label="Close budget"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              <fieldset
                className="form-grid"
                disabled={disabled || busy || !!modal.pending}
              >
                <label className="field">
                  Budget name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={modal.record.name}
                  />
                </label>
                <label className="field">
                  Monthly limit (₹)
                  <input
                    name="amount"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    defaultValue={modal.record.amount}
                  />
                </label>
                <BudgetTagPicker budget={modal.record} tags={tags} />
                <label className="field">
                  Budget account
                  <select
                    name="accountId"
                    defaultValue={modal.record.accountId}
                  >
                    <option value="">All selected owner accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Month
                  <input
                    name="month"
                    type="month"
                    required
                    defaultValue={modal.record.month || month}
                  />
                </label>
                <label className="credit-select-all">
                  <input
                    type="checkbox"
                    name="repeat"
                    defaultChecked={!!modal.record.id && !modal.record.month}
                  />
                  Repeat every month
                </label>
              </fieldset>
              {validation && <p role="alert">{validation}</p>}
              {failed && (
                <p role="alert">Save not confirmed. Retry the same budget.</p>
              )}
              <div className="form-footer">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={busy || disabled}>
                  {busy
                    ? "Saving…"
                    : modal.pending
                      ? "Retry budget"
                      : "Save budget"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
