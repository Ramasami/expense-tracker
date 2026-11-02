"use client";
import { useState } from "react";
import { RecordData, money } from "../lib/finance";
import {
  parseCSV,
  statementDate,
  statementAmount,
  statementDuplicates,
} from "../lib/statement-import";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
type Preview = {
  record: any;
  selected: boolean;
  error: string;
  duplicate: boolean;
  op: string;
  done?: boolean;
  attempted?: boolean;
};
const columnNames: Record<string, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  debit: "Debit / withdrawal",
  credit: "Credit / deposit",
};
export default function StatementImport({
  accounts,
  tags,
  rows,
  disabled,
  onSave,
  onSync,
}: {
  accounts: RecordData[];
  tags: RecordData[];
  rows: RecordData[];
  disabled: boolean;
  onSave: (r: any, op: string) => Promise<boolean>;
  onSync: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [csv, setCsv] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [account, setAccount] = useState(""),
    [card, setCard] = useState(""),
    [tag, setTag] = useState(""),
    [direction, setDirection] = useState("expense"),
    [dateFormat, setDateFormat] = useState<"DMY" | "MDY">("DMY"),
    [settlement, setSettlement] = useState("Unknown"),
    [preview, setPreview] = useState<Preview[]>([]),
    [previewPage, setPreviewPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [filename, setFilename] = useState("");
  useDialogScrollLock(open);
  const target = accounts.find((a) => a.id === (account || accounts[0]?.id));
  const selected = preview.filter((r) => r.selected && !r.done);
  async function read(file?: File) {
    if (!file) return;
    setError("");
    setPreview([]);
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a CSV smaller than 5 MB.");
      return;
    }
    try {
      const parsed = parseCSV(await file.text());
      setCsv(parsed);
      setFilename(file.name);
      const aliases: Record<string, RegExp> = {
        date: /^(transaction\s*date|date|value\s*date|posting\s*date)$/i,
        description:
          /^(description|narration|merchant|particulars|description\s*\/\s*merchant)$/i,
        amount: /^(amount|amount\s*\(.*\))$/i,
        debit: /^(debit.*|withdrawal.*|withdrawals.*)$/i,
        credit: /^(credit.*|deposit.*)$/i,
      };
      setMapping(
        Object.fromEntries(
          Object.entries(aliases).map(([key, regex]) => [
            key,
            String(parsed[0].findIndex((header) => regex.test(header.trim()))),
          ]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
      setCsv([]);
    }
  }
  function build() {
    setPreviewPage(0);
    setError("");
    if (!target) {
      setError("Choose an account.");
      return;
    }
    const sourceId = crypto.randomUUID();
    const cell = (row: string[], key: string) =>
      row[Number(mapping[key])] || "";
    const result: Preview[] = csv.slice(1).map((row, index) => {
      const record: any = {
        description: cell(row, "description").trim(),
        account: target.id,
        tagId:
          tag ||
          tags.find((t) => t.status === "Active" && t.type === "Expense")?.id ||
          "",
        payment: card ? "Credit Card" : "Bank Transfer",
        expenseMode: card ? "Credit" : "Debit",
        creditCardId: card,
        statementImport: true,
        sourceStatementId: `${sourceId}:${index}`,
        notes: `Imported from ${filename}`,
      };
      let error = "";
      try {
        record.date = statementDate(cell(row, "date"), dateFormat);
        if (!record.description) throw Error("Description is required.");
        let amount: number;
        if (Number(mapping.debit) >= 0 || Number(mapping.credit) >= 0) {
          const debit = cell(row, "debit").trim()
              ? statementAmount(cell(row, "debit"))
              : 0,
            credit = cell(row, "credit").trim()
              ? statementAmount(cell(row, "credit"))
              : 0;
          if (debit < 0 || credit < 0 || (debit && credit))
            throw Error("Use one positive debit or credit amount.");
          amount = debit || credit;
          record.type = debit ? "Expense" : "Income";
        } else {
          amount = statementAmount(cell(row, "amount"));
          record.type =
            direction === "expense"
              ? amount >= 0
                ? "Expense"
                : "Income"
              : amount >= 0
                ? "Income"
                : "Expense";
        }
        if (!amount) throw Error("Amount must be non-zero.");
        record.amount = Math.abs(amount);
        if (card) {
          record.cardRefund = record.type === "Income";
          record.settlementStatus = record.type === "Expense" ? settlement : "";
        }
      } catch (e) {
        error = (e as Error).message;
      }
      return {
        record,
        selected: !error,
        error,
        duplicate: false,
        op: crypto.randomUUID(),
      };
    });
    const duplicates = statementDuplicates(
      result.map((r) => r.record),
      rows,
    );
    setPreview(
      result.map((r, i) => ({
        ...r,
        duplicate: duplicates[i],
        selected: r.selected && !duplicates[i],
      })),
    );
  }
  function edit(index: number, key: string, value: string) {
    setPreview((items) => {
      const next = items.map((item, i) =>
        i === index
          ? {
              ...item,
              record: {
                ...item.record,
                [key]: key === "amount" ? Number(value) : value,
              },
              op: crypto.randomUUID(),
            }
          : item,
      );
      const duplicates = statementDuplicates(
        next.map((r) => r.record),
        rows,
      );
      return next.map((r, i) => ({
        ...r,
        duplicate: duplicates[i],
        selected: duplicates[i] && !r.duplicate ? false : r.selected,
      }));
    });
  }
  async function commit() {
    if (busy || disabled || !selected.length) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      let count = 0;
      for (const item of selected) {
        const r = { ...item.record, importDuplicateConfirmed: item.duplicate };
        if (card) {
          r.cardRefund = r.type === "Income";
          r.settlementStatus = r.type === "Expense" ? settlement : "";
        }
        if (
          !r.date ||
          !r.description ||
          !r.tagId ||
          !Number.isFinite(r.amount) ||
          r.amount <= 0
        ) {
          setError(
            "Complete the date, description, tag and positive amount for each selected row.",
          );
          break;
        }
        setPreview((items) =>
          items.map((i) => (i.op === item.op ? { ...i, attempted: true } : i)),
        );
        if (!(await onSave(r, item.op))) {
          setError(
            "Import paused: Google did not confirm this row. Sync if needed, then retry. Confirmed rows are not imported again.",
          );
          break;
        }
        setPreview((items) =>
          items.map((i) =>
            i.op === item.op ? { ...i, done: true, selected: false } : i,
          ),
        );
        setProgress(++count);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button disabled={disabled} onClick={() => setOpen(true)}>
        Import statement
      </button>
      {open && (
        <div className="modal-overlay">
          <section
            className="modal import-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import statement"
          >
            <div className="card-heading">
              <div>
                <h2>Import statement</h2>
                <p>Upload → review → confirm</p>
              </div>
              <button
                aria-label="Close statement import"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="feature-body">
              <fieldset className="form-grid" disabled={busy || disabled}>
                <label className="field">
                  Statement CSV
                  <input
                    aria-label="Statement CSV"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => void read(e.target.files?.[0])}
                  />
                </label>
                <label className="field">
                  Import into account
                  <select
                    aria-label="Import into account"
                    value={target?.id || ""}
                    onChange={(e) => {
                      setAccount(e.target.value);
                      setCard("");
                      setPreview([]);
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Statement kind
                  <select
                    value={card}
                    aria-label="Statement kind"
                    onChange={(e) => {
                      setCard(e.target.value);
                      setPreview([]);
                    }}
                  >
                    <option value="">Bank transactions</option>
                    {(target?.creditCards || []).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Default expense tag
                  <select value={tag} onChange={(e) => setTag(e.target.value)}>
                    <option value="">Choose in preview</option>
                    {tags
                      .filter((t) => t.status === "Active")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Date format
                  <select
                    aria-label="Import date format"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as any)}
                  >
                    <option value="DMY">Day / month / year</option>
                    <option value="MDY">Month / day / year</option>
                  </select>
                </label>
                {card && (
                  <label className="field">
                    Purchase payment status
                    <select
                      value={settlement}
                      onChange={(e) => setSettlement(e.target.value)}
                    >
                      <option value="Unknown">
                        Unknown — review before payment
                      </option>
                      <option value="Unpaid">Unpaid / unbilled</option>
                    </select>
                  </label>
                )}
              </fieldset>
              {csv.length > 0 && (
                <details open={!preview.length} className="feature-details">
                  <summary>Match statement columns</summary>
                  <fieldset
                    className="form-grid feature-body"
                    disabled={busy || disabled}
                  >
                    {Object.entries(columnNames).map(([key, label]) => (
                      <label className="field" key={key}>
                        {label}
                        <select
                          aria-label={`CSV ${label} column`}
                          value={mapping[key] ?? "-1"}
                          onChange={(e) =>
                            setMapping({ ...mapping, [key]: e.target.value })
                          }
                        >
                          <option value="-1">Not used</option>
                          {csv[0].map((header, i) => (
                            <option key={i} value={i}>
                              {header || `Column ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label className="field">
                      Signed amount convention
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                      >
                        <option value="expense">
                          Positive = expense; negative = income
                        </option>
                        <option value="income">
                          Positive = income; negative = expense
                        </option>
                      </select>
                    </label>
                  </fieldset>
                  <button disabled={busy || disabled} onClick={build}>
                    Build preview
                  </button>
                </details>
              )}
              {!!preview.length && (
                <>
                  <div className="import-summary">
                    <b>
                      {selected.length} selected ·{" "}
                      {money(
                        selected.reduce(
                          (s, r) => s + Number(r.record.amount || 0),
                          0,
                        ),
                      )}
                    </b>
                    <small>
                      {preview.filter((r) => r.duplicate).length} possible
                      duplicates skipped by default ·{" "}
                      {preview.filter((r) => r.done).length} saved
                    </small>
                    <label>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={
                          selected.length > 0 &&
                          selected.length ===
                            preview.filter(
                              (r) => !r.done && !r.duplicate && !r.error,
                            ).length
                        }
                        onChange={(e) =>
                          setPreview((items) =>
                            items.map((r) => ({
                              ...r,
                              selected:
                                e.target.checked &&
                                !r.done &&
                                !r.duplicate &&
                                !r.error,
                            })),
                          )
                        }
                      />
                      Select valid, non-duplicate rows
                    </label>
                  </div>
                  {preview.length > 25 && (
                    <div className="row-actions">
                      <button
                        disabled={busy || previewPage === 0}
                        onClick={() => setPreviewPage(previewPage - 1)}
                      >
                        Previous preview rows
                      </button>
                      <small>
                        {previewPage * 25 + 1}–
                        {Math.min(preview.length, (previewPage + 1) * 25)} of{" "}
                        {preview.length}
                      </small>
                      <button
                        disabled={
                          busy || (previewPage + 1) * 25 >= preview.length
                        }
                        onClick={() => setPreviewPage(previewPage + 1)}
                      >
                        Next preview rows
                      </button>
                    </div>
                  )}
                  <div className="import-preview">
                    {preview
                      .slice(previewPage * 25, previewPage * 25 + 25)
                      .map((item, visibleIndex) => {
                        const i = previewPage * 25 + visibleIndex;
                        return (
                          <article className="import-row" key={i}>
                            <label>
                              <input
                                aria-label={`Import row ${i + 1}`}
                                type="checkbox"
                                disabled={busy || item.done || item.attempted}
                                checked={item.selected}
                                onChange={(e) =>
                                  setPreview((items) =>
                                    items.map((r, j) =>
                                      j === i
                                        ? { ...r, selected: e.target.checked }
                                        : r,
                                    ),
                                  )
                                }
                              />
                              <b>
                                Row {i + 1}
                                {item.done
                                  ? " · Saved"
                                  : item.duplicate
                                    ? " · Possible duplicate"
                                    : ""}
                              </b>
                            </label>
                            <fieldset
                              className="form-grid"
                              disabled={busy || item.done || item.attempted}
                            >
                              <input
                                aria-label={`Row ${i + 1} date`}
                                type="date"
                                value={item.record.date || ""}
                                onChange={(e) =>
                                  edit(i, "date", e.target.value)
                                }
                              />
                              <input
                                aria-label={`Row ${i + 1} description`}
                                value={item.record.description}
                                onChange={(e) =>
                                  edit(i, "description", e.target.value)
                                }
                              />
                              <input
                                aria-label={`Row ${i + 1} amount`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.record.amount || ""}
                                onChange={(e) =>
                                  edit(i, "amount", e.target.value)
                                }
                              />
                              <select
                                aria-label={`Row ${i + 1} type`}
                                value={item.record.type || "Expense"}
                                onChange={(e) =>
                                  edit(i, "type", e.target.value)
                                }
                              >
                                {(card
                                  ? ["Expense", "Income"]
                                  : [
                                      "Expense",
                                      "Income",
                                      "Investment",
                                      "Transfer",
                                    ]
                                ).map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                              {item.record.type === "Transfer" && (
                                <>
                                  <select
                                    aria-label={`Row ${i + 1} from account`}
                                    value={item.record.account}
                                    onChange={(e) =>
                                      edit(i, "account", e.target.value)
                                    }
                                  >
                                    {accounts.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.name}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    aria-label={`Row ${i + 1} to account`}
                                    value={item.record.toAccount || ""}
                                    onChange={(e) =>
                                      edit(i, "toAccount", e.target.value)
                                    }
                                  >
                                    <option value="">
                                      Choose destination account
                                    </option>
                                    {accounts
                                      .filter(
                                        (a) => a.id !== item.record.account,
                                      )
                                      .map((a) => (
                                        <option key={a.id} value={a.id}>
                                          {a.name}
                                        </option>
                                      ))}
                                  </select>
                                </>
                              )}
                              <select
                                aria-label={`Row ${i + 1} tag`}
                                value={item.record.tagId}
                                onChange={(e) =>
                                  edit(i, "tagId", e.target.value)
                                }
                              >
                                <option value="">Choose expense tag</option>
                                {tags
                                  .filter((t) => t.status === "Active")
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                              </select>
                            </fieldset>
                            {item.error && (
                              <small>
                                Source row needs review: {item.error}
                              </small>
                            )}
                          </article>
                        );
                      })}
                  </div>
                </>
              )}
              {error && (
                <div>
                  <p role="alert">{error}</p>
                  <button disabled={busy} onClick={() => void onSync()}>
                    Sync with Google Sheets
                  </button>
                </div>
              )}
              {busy && (
                <div role="status">
                  <progress
                    value={progress}
                    max={selected.length + progress || 1}
                  />
                  Saved {progress} rows. Keep this window open.
                </div>
              )}
            </div>
            <div className="form-footer">
              <button disabled={busy} onClick={() => setOpen(false)}>
                Close
              </button>
              <button
                className="primary"
                disabled={disabled || busy || !selected.length}
                onClick={() => void commit()}
              >
                {busy
                  ? "Importing…"
                  : `Import ${selected.length} selected transactions`}
              </button>
            </div>
            <p className="credit-help">
              CSV only, up to 500 rows. Review duplicates, tags and transfers
              before importing. Use the card-bill and loan-payment screens for
              payments that need charge or principal/interest links.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
