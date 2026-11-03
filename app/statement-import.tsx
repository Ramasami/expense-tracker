"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CategorySuggestion from "./category-suggestion";
import { duplicateMatches } from "../lib/smart-finance";
import { Check, FileText } from "lucide-react";
import { RecordData, money } from "../lib/finance";
import {
  parseCSV,
  statementDate,
  statementAmount,
  statementDuplicates,
} from "../lib/statement-import";
import {
  analyzeDocuments,
  scannerStatus,
  matchScannedCard,
  ScanHints,
  scanDocumentSchema,
} from "../lib/document-scanner";
import {
  uploadReceipt,
  type Receipt,
  type ReceiptProgress,
} from "../lib/receipts";
import { TransferProgress } from "./receipts";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
import { AI_PROVIDERS, type AIProvider } from "../lib/ai-providers";
type Preview = {
  record: any;
  selected: boolean;
  error: string;
  duplicate: boolean;
  op: string;
  done?: boolean;
  attempted?: boolean;
  sourceFile?: File;
  receipt?: Receipt;
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
  triggerLabel = "Import statement",
  initialMode = "csv",
  onClose,
}: {
  accounts: RecordData[];
  tags: RecordData[];
  rows: RecordData[];
  disabled: boolean;
  onSave: (r: any, op: string) => Promise<boolean>;
  onSync: () => Promise<void>;
  triggerLabel?: string;
  initialMode?: "csv" | "scan";
  onClose?: (imported: boolean) => void;
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
    [mode, setMode] = useState<"csv" | "scan">(initialMode),
    [scanFiles, setScanFiles] = useState<File[]>([]),
    [scannerProvider, setScannerProvider] = useState<AIProvider | undefined>(
      undefined,
    ),
    [scannerConfigured, setScannerConfigured] = useState<boolean | null>(null),
    [scannerChecking, setScannerChecking] = useState(false),
    [scannerCheckError, setScannerCheckError] = useState(""),
    [scanKind, setScanKind] = useState<ScanHints["statementKind"]>("Auto"),
    [scanDateFormat, setScanDateFormat] =
      useState<ScanHints["dateFormat"]>("Auto"),
    [detected, setDetected] = useState<
      ReturnType<typeof scanDocumentSchema.parse>[]
    >([]),
    [scanStage, setScanStage] = useState(""),
    [receiptTransfer, setReceiptTransfer] = useState<{
      name: string;
      progress: ReceiptProgress;
    } | null>(null),
    [scanWarnings, setScanWarnings] = useState<string[]>([]),
    [reviewConfirmed, setReviewConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [filename, setFilename] = useState("");
  useDialogScrollLock(open);
  useEffect(() => {
    if (!open) setScanFiles([]);
  }, [open]);
  useEffect(() => setReviewConfirmed(false), [preview]);
  useEffect(() => {
    if (!open || mode !== "scan") return;
    let active = true;
    setScannerChecking(true);
    setScannerCheckError("");
    scannerStatus()
      .then((status) => {
        if (active) {
          setScannerConfigured(status.configured);
          setScannerProvider(status.provider || "openai");
        }
      })
      .catch((e) => {
        if (active) {
          setScannerConfigured(null);
          setScannerCheckError((e as Error).message);
        }
      })
      .finally(() => {
        if (active) setScannerChecking(false);
      });
    return () => {
      active = false;
    };
  }, [open, mode]);
  async function checkScannerSetup() {
    setScannerChecking(true);
    setScannerCheckError("");
    try {
      const status = await scannerStatus();
      setScannerConfigured(status.configured);
      setScannerProvider(status.provider || "openai");
    } catch (e) {
      setScannerConfigured(null);
      setScannerCheckError((e as Error).message);
    } finally {
      setScannerChecking(false);
    }
  }
  const target = accounts.find((a) => a.id === (account || accounts[0]?.id));
  const selected = preview.filter((r) => r.selected && !r.done);
  const importComplete = preview.length > 0 && preview.every((row) => row.done);
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
  async function scan() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setPreview([]);
    setReviewConfirmed(false);
    setScanWarnings([]);
    try {
      if (scannerConfigured === null)
        throw Error("Check scanner setup before analyzing documents.");
      const result = await analyzeDocuments(
        scanFiles,
        tags,
        setScanStage,
        scannerConfigured ?? undefined,
        {
          statementKind: scanKind,
          dateFormat: scanDateFormat,
          creditCardName: (target?.creditCards || []).find(
            (item: any) => item.id === card,
          )?.name,
        },
        scannerProvider,
      );
      setDetected(result.documents);
      const source = crypto.randomUUID();
      const proposed: Preview[] = result.transactions.map((row, index) => {
        const needsLink = ["card_payment", "loan_payment"].includes(row.kind);
        const document = result.documents.find(
          (item) => item.sourceIndex === row.sourceIndex,
        );
        const kind = scanKind === "Auto" ? document?.statementKind : scanKind;
        const credit =
          !!card ||
          kind === "CreditCard" ||
          (kind !== "Bank" && row.expenseMode === "Credit");
        const detectedCard =
          card ||
          (credit
            ? matchScannedCard(
                row.creditCardHint || document?.creditCardHint,
                target?.creditCards || [],
              )
            : "");
        const record: any = {
          date: row.date || "",
          description: row.description,
          amount: row.amount || 0,
          type: row.type,
          tagId: tags.some((t) => t.id === row.tagId && t.status === "Active")
            ? row.tagId
            : "",
          account: target?.id || "",
          expenseMode:
            row.type === "Expense"
              ? credit
                ? "Credit"
                : kind === "Bank"
                  ? "Debit"
                  : row.expenseMode
              : "Debit",
          creditCardId: detectedCard,
          cardRefund: row.kind === "refund" && credit,
          scanKind: row.kind,
          payment: credit ? "Credit Card" : "Bank Transfer",
          settlementStatus: credit && row.type === "Expense" ? settlement : "",
          statementImport: true,
          sourceStatementId: `scan-${source}:${index}`,
          notes: `AI scan · ${scanFiles[row.sourceIndex]?.name || "document"}. ${row.notes}`,
          scanNeedsLink: needsLink,
          scanAccountHint: row.accountHint || "",
          scanCardHint: row.creditCardHint || document?.creditCardHint || "",
          currency: row.currency,
          confidence: row.confidence,
        };
        const error = needsLink
          ? "Use the loan/card payment screen to link this payment correctly."
          : row.currency !== "INR"
            ? "Confirm the currency and enter an INR amount before importing."
            : !row.date ||
                !row.amount ||
                row.type === "Unknown" ||
                (row.type === "Expense" && record.expenseMode === "Unknown")
              ? "Review the missing or uncertain fields."
              : "";
        return {
          record,
          sourceFile: scanFiles[row.sourceIndex],
          selected:
            !error &&
            row.confidence === "high" &&
            !!record.tagId &&
            (!(record.expenseMode === "Credit" || record.cardRefund) ||
              !!record.creditCardId),
          error,
          duplicate: false,
          op: crypto.randomUUID(),
        };
      });
      const duplicates = statementDuplicates(
        proposed.map((r) => r.record),
        rows,
      );
      setPreview(
        proposed.map((r, i) => ({
          ...r,
          duplicate: duplicates[i],
          selected: r.selected && !duplicates[i],
        })),
      );
      setScanWarnings(result.warnings);
      setPreviewPage(0);
      if (!proposed.length)
        setError(
          "No importable transactions were found. Check the warnings or enter the records manually.",
        );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setScanStage("");
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
  function edit(index: number, key: string, value: string | boolean) {
    setReviewConfirmed(false);
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
    if (
      busy ||
      disabled ||
      !selected.length ||
      (mode === "scan" && !reviewConfirmed)
    )
      return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      let count = 0;
      for (const item of selected) {
        const r = { ...item.record, importDuplicateConfirmed: item.duplicate };
        if (r.type !== "Income") r.cardRefund = false;
        if (r.creditCardId) {
          if (mode === "csv") r.cardRefund = r.type === "Income";
          r.settlementStatus = r.type === "Expense" ? settlement : "";
        }
        if (
          mode === "scan" &&
          r.type === "Expense" &&
          !["Debit", "Credit"].includes(r.expenseMode)
        ) {
          setError(
            "Confirm debit or credit-card timing for each selected expense.",
          );
          break;
        }
        if (
          mode === "scan" &&
          ((r.type === "Expense" && r.expenseMode === "Credit") ||
            r.cardRefund) &&
          !r.creditCardId
        ) {
          setError(
            "Choose the correct credit card for each selected card purchase or refund.",
          );
          break;
        }
        if (
          r.type === "Transfer" &&
          (!r.toAccount || r.toAccount === r.account)
        ) {
          setError("Choose two different accounts for each selected transfer.");
          break;
        }
        if (mode === "scan" && (r.scanNeedsLink || r.currency !== "INR")) {
          setError(
            "Review currency and use linked payment screens for card or loan repayments.",
          );
          break;
        }
        if (!["Expense", "Income", "Investment", "Transfer"].includes(r.type)) {
          setError("Choose a transaction type for every selected row.");
          break;
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
        if (mode === "scan") {
          let receipt = item.receipt;
          if (!receipt) {
            if (!item.sourceFile)
              throw Error(
                "The source document is missing. Select it and analyze again before importing.",
              );
            // A separate Drive file per transaction keeps receipt deletion independent.
            // The stable row operation also makes interrupted upload retries idempotent.
            receipt = await uploadReceipt(
              item.sourceFile,
              `scan-${item.op}`,
              (progress) =>
                setReceiptTransfer({ name: item.sourceFile!.name, progress }),
            );
            const attached = receipt;
            setPreview((items) =>
              items.map((i) =>
                i.op === item.op ? { ...i, receipt: attached } : i,
              ),
            );
          }
          r.receipts = [receipt];
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
    } catch (error) {
      setError(
        `Import paused: ${(error as Error).message} No further rows were saved. Retry to continue.`,
      );
    } finally {
      setReceiptTransfer(null);
      setBusy(false);
    }
  }
  return (
    <>
      <button disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open &&
        createPortal(
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
                  onClick={() => {
                    setOpen(false);
                    onClose?.(preview.some((row) => row.done));
                  }}
                >
                  ×
                </button>
              </div>
              <div className="feature-body">
                <div className="pill-options" aria-label="Statement input mode">
                  <button
                    type="button"
                    aria-pressed={mode === "csv"}
                    disabled={busy}
                    onClick={() => {
                      setMode("csv");
                      setPreview([]);
                      setError("");
                    }}
                  >
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "scan"}
                    disabled={busy}
                    onClick={() => {
                      setMode("scan");
                      setScanKind("Auto");
                      setCard("");
                      setDetected([]);
                      setPreview([]);
                      setError("");
                    }}
                  >
                    Upload using AI
                  </button>
                </div>
                <fieldset className="form-grid" disabled={busy || disabled}>
                  {mode === "csv" ? (
                    <>
                      <label className="field">
                        Statement CSV
                        <input
                          aria-label="Statement CSV"
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => void read(e.target.files?.[0])}
                        />
                        <small>
                          <a
                            href="./sample-transactions.csv"
                            download="budget-tracker-sample.csv"
                          >
                            Download sample CSV ↗
                          </a>
                          <br />
                          Example data · DD/MM/YYYY dates. Use either Debit or
                          Credit per row, then choose tags in preview.
                        </small>
                      </label>
                    </>
                  ) : (
                    <label className="field scan-upload">
                      Images or PDFs
                      <input
                        aria-label="Scan documents"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => {
                          setScanFiles(Array.from(event.target.files || []));
                          setDetected([]);
                          setPreview([]);
                          setReviewConfirmed(false);
                          setError("");
                        }}
                      />
                      <small>
                        {scanFiles.length
                          ? scanFiles.map((file) => file.name).join(" · ")
                          : "Choose up to 5 bills, receipts or statement screenshots"}
                      </small>
                      <small>
                        Source files attach to the transactions when you import.
                      </small>
                    </label>
                  )}
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
                  {mode === "csv" ? (
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
                  ) : (
                    <>
                      <label className="credit-statement-toggle">
                        <input
                          type="checkbox"
                          aria-label="Credit card statement"
                          checked={scanKind === "CreditCard"}
                          onChange={(event) => {
                            setScanKind(
                              event.target.checked ? "CreditCard" : "Auto",
                            );
                            setCard("");
                            setPreview([]);
                            setDetected([]);
                          }}
                        />
                        <span>Credit card statement</span>
                      </label>
                      {(scanKind === "CreditCard" ||
                        detected.some(
                          (item) => item.statementKind === "CreditCard",
                        ) ||
                        !!card) && (
                        <label className="field">
                          Credit card
                          <select
                            aria-label="Statement credit card"
                            value={card}
                            onChange={(event) => {
                              setCard(event.target.value);
                              setPreview([]);
                            }}
                          >
                            <option value="">
                              Auto · identify from uploaded file
                            </option>
                            {(target?.creditCards || []).map((item: any) => (
                              <option value={item.id} key={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <small>
                            Choose the account that owns this card. Unmatched
                            cards require selection in preview.
                          </small>
                        </label>
                      )}
                    </>
                  )}
                  <label className="field">
                    Default expense tag
                    <select
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                    >
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
                      value={mode === "scan" ? scanDateFormat : dateFormat}
                      onChange={(e) => {
                        if (mode === "scan") {
                          setScanDateFormat(
                            e.target.value as ScanHints["dateFormat"],
                          );
                          setPreview([]);
                          setDetected([]);
                        } else setDateFormat(e.target.value as any);
                      }}
                    >
                      {mode === "scan" && (
                        <option value="Auto">Auto · infer from document</option>
                      )}
                      <option value="DMY">Day / month / year</option>
                      <option value="MDY">Month / day / year</option>
                      {mode === "scan" && (
                        <option value="YMD">Year / month / day</option>
                      )}
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
                {mode === "csv" && csv.length > 0 && (
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
                {mode === "scan" && (
                  <div className="scan-intro">
                    <button
                      className="primary"
                      disabled={
                        busy || disabled || scannerChecking || !scanFiles.length
                      }
                      onClick={() => void scan()}
                    >
                      {busy && scanStage ? "Analyzing…" : "Analyze with AI"}
                    </button>
                    <small>
                      Provider:{" "}
                      {AI_PROVIDERS[scannerProvider || "openai"].label} · change
                      in Settings
                    </small>
                    {scannerProvider === "groq" && (
                      <small>
                        Groq: up to 3 images. For PDFs, use OpenAI/Gemini or
                        upload page screenshots.
                      </small>
                    )}
                    <details className="scan-about">
                      <summary>How it works &amp; setup</summary>
                      <p>
                        Analyze selected documents with{" "}
                        {AI_PROVIDERS[scannerProvider || "openai"].name}, then
                        review the proposed transactions. Nothing is written to
                        your Sheet until you confirm.
                      </p>
                      <small>
                        Source files attach as receipts when you confirm the
                        import.
                      </small>
                      <p role="status">
                        {scannerChecking
                          ? "Checking scanner configuration…"
                          : scannerConfigured === true
                            ? "Configured · ready to analyze."
                            : scannerConfigured === false
                              ? "Scanner not configured yet."
                              : scannerCheckError}
                      </p>
                      {scannerConfigured !== true && (
                        <button
                          className="secondary"
                          disabled={scannerChecking || busy}
                          onClick={() => void checkScannerSetup()}
                        >
                          Check setup again
                        </button>
                      )}
                      {scannerConfigured === false && (
                        <details>
                          <summary>Scanner setup</summary>
                          <p>
                            Add your key once in Settings → AI bill & statement
                            scanner. It remains saved across refreshes, devices,
                            sign-ins and deployments until you remove or replace
                            it. API billing is separate from ChatGPT. Never put
                            the key in source files or the repository.
                          </p>
                          <a
                            href="https://script.google.com/home/projects/175q3amnRU4HHfmogHaJN7eKwFqxSivLn_ACf6Dp4uZbCJHGZRTM5P2Qu/edit"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Apps Script project (advanced) ↗
                          </a>
                        </details>
                      )}
                    </details>
                  </div>
                )}
                {mode === "scan" && detected.length > 0 && (
                  <section
                    className="scan-detection"
                    aria-label="Detected document details"
                  >
                    <b>Document details · review detected values</b>
                    {detected.map((item) => (
                      <p key={item.sourceIndex}>
                        {scanFiles[item.sourceIndex]?.name ||
                          `Document ${item.sourceIndex + 1}`}{" "}
                        ·{" "}
                        {scanKind === "Auto"
                          ? item.statementKind === "CreditCard"
                            ? "Credit card statement"
                            : item.statementKind
                          : scanKind === "CreditCard"
                            ? "Credit card statement (selected)"
                            : scanKind + " (selected)"}{" "}
                        · Date format:{" "}
                        {scanDateFormat === "Auto"
                          ? item.dateFormat
                          : scanDateFormat + " (selected)"}
                        {item.creditCardHint ? ` · ${item.creditCardHint}` : ""}
                        {item.dateFormat === "Unknown" &&
                        scanDateFormat === "Auto"
                          ? " · Choose a date format or verify each date; ambiguous dates are not guessed."
                          : ""}
                      </p>
                    ))}
                  </section>
                )}
                {scanWarnings.length > 0 && mode === "scan" && (
                  <details className="scan-warnings" open>
                    <summary>Review notes ({scanWarnings.length})</summary>
                    <ul>
                      {scanWarnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {!!preview.length && (
                  <>
                    <div className="import-summary">
                      <div className="import-summary-heading">
                        <b>
                          {importComplete
                            ? "Import complete"
                            : "Review transactions"}
                          <small>
                            {importComplete
                              ? "All entries saved to Google Sheets"
                              : `${selected.length} selected`}
                          </small>
                        </b>
                        <strong>
                          {money(
                            (importComplete ? preview : selected).reduce(
                              (s, r) => s + Number(r.record.amount || 0),
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <small>
                        {preview.filter((r) => r.duplicate).length} possible
                        duplicates skipped by default ·{" "}
                        {preview.filter((r) => r.done).length} saved
                      </small>
                      {!importComplete && (
                        <label>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={
                              selected.length > 0 &&
                              selected.length ===
                                preview.filter(
                                  (r) =>
                                    !r.done &&
                                    !r.duplicate &&
                                    !r.error &&
                                    !r.record.scanNeedsLink,
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
                      )}
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
                            <article
                              className="import-row"
                              data-state={
                                item.done
                                  ? "saved"
                                  : item.attempted
                                    ? "pending"
                                    : "review"
                              }
                              key={i}
                            >
                              <div className="import-row-heading">
                                {item.done ? (
                                  <span className="import-saved-title">
                                    <Check size={17} />
                                    Transaction {i + 1}
                                  </span>
                                ) : (
                                  <label className="import-row-select">
                                    <input
                                      aria-label={`Import row ${i + 1}`}
                                      type="checkbox"
                                      disabled={
                                        busy ||
                                        item.done ||
                                        item.attempted ||
                                        item.record.scanNeedsLink
                                      }
                                      checked={item.selected}
                                      onChange={(e) =>
                                        setPreview((items) =>
                                          items.map((r, j) =>
                                            j === i
                                              ? {
                                                  ...r,
                                                  selected: e.target.checked,
                                                }
                                              : r,
                                          ),
                                        )
                                      }
                                    />
                                    <b>Transaction {i + 1}</b>
                                  </label>
                                )}
                                <span className="import-row-status">
                                  {item.done
                                    ? "Saved"
                                    : item.attempted
                                      ? "Awaiting confirmation"
                                      : item.duplicate
                                        ? "Possible duplicate"
                                        : item.selected
                                          ? "Selected"
                                          : "Not selected"}
                                </span>
                              </div>
                              {item.done ? (
                                <div className="import-saved-content">
                                  <div className="import-saved-merchant">
                                    <strong>{item.record.description}</strong>
                                    <b>{money(item.record.amount)}</b>
                                  </div>
                                  <dl className="import-saved-facts">
                                    <div>
                                      <dt>Date</dt>
                                      <dd>
                                        {new Date(
                                          item.record.date + "T12:00:00",
                                        ).toLocaleDateString("en-IN", {
                                          day: "numeric",
                                          month: "short",
                                          year: "numeric",
                                        })}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Type</dt>
                                      <dd>{item.record.type}</dd>
                                    </div>
                                    <div>
                                      <dt>From account</dt>
                                      <dd>
                                        {accounts.find(
                                          (a) => a.id === item.record.account,
                                        )?.name || "—"}
                                      </dd>
                                    </div>
                                    {item.record.toAccount && (
                                      <div>
                                        <dt>To account</dt>
                                        <dd>
                                          {accounts.find(
                                            (a) =>
                                              a.id === item.record.toAccount,
                                          )?.name || "—"}
                                        </dd>
                                      </div>
                                    )}
                                    <div>
                                      <dt>Expense tag</dt>
                                      <dd>
                                        {tags.find(
                                          (t) => t.id === item.record.tagId,
                                        )?.name || "—"}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              ) : (
                                <fieldset
                                  className="form-grid import-fields"
                                  disabled={
                                    busy ||
                                    item.done ||
                                    item.attempted ||
                                    item.record.scanNeedsLink
                                  }
                                >
                                  <label className="import-field import-field-wide">
                                    <span>Description / merchant</span>
                                    <input
                                      aria-label={`Row ${i + 1} description`}
                                      value={item.record.description}
                                      onChange={(e) =>
                                        edit(i, "description", e.target.value)
                                      }
                                    />
                                  </label>
                                  <label className="import-field">
                                    <span>Date</span>
                                    <input
                                      aria-label={`Row ${i + 1} date`}
                                      type="date"
                                      value={item.record.date || ""}
                                      onChange={(e) =>
                                        edit(i, "date", e.target.value)
                                      }
                                    />
                                  </label>

                                  <label className="import-field">
                                    <span>Amount (₹)</span>
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
                                  </label>
                                  <label className="import-field">
                                    <span>Transaction type</span>
                                    <select
                                      aria-label={`Row ${i + 1} type`}
                                      value={item.record.type || "Expense"}
                                      onChange={(e) =>
                                        edit(i, "type", e.target.value)
                                      }
                                    >
                                      {item.record.type === "Unknown" && (
                                        <option value="Unknown">
                                          Choose transaction type
                                        </option>
                                      )}
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
                                  </label>
                                  {(mode === "scan" ||
                                    item.record.type === "Transfer") && (
                                    <label className="import-field">
                                      <span>From account</span>
                                      <select
                                        aria-label={`Row ${i + 1} from account`}
                                        value={item.record.account}
                                        onChange={(e) => {
                                          edit(i, "account", e.target.value);
                                          if (mode === "scan")
                                            edit(i, "creditCardId", "");
                                        }}
                                      >
                                        {accounts.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                  {item.record.type === "Transfer" && (
                                    <label className="import-field">
                                      <span>To account</span>
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
                                    </label>
                                  )}
                                  {mode === "scan" &&
                                    item.record.type === "Expense" && (
                                      <label className="import-field import-field-wide">
                                        <span>Payment timing</span>
                                        <select
                                          aria-label={`Row ${i + 1} expense timing`}
                                          value={
                                            item.record.expenseMode || "Unknown"
                                          }
                                          onChange={(e) =>
                                            edit(
                                              i,
                                              "expenseMode",
                                              e.target.value,
                                            )
                                          }
                                        >
                                          <option value="Unknown">
                                            Confirm debit / credit card
                                          </option>
                                          <option value="Debit">
                                            Debit · immediate expense
                                          </option>
                                          <option value="Credit">
                                            Credit card · deferred expense
                                          </option>
                                        </select>
                                      </label>
                                    )}
                                  {mode === "scan" &&
                                    item.record.scanKind === "refund" && (
                                      <label className="import-field import-field-wide">
                                        <span>Refund destination</span>
                                        <select
                                          aria-label={`Row ${i + 1} refund destination`}
                                          value={
                                            item.record.cardRefund
                                              ? "card"
                                              : "bank"
                                          }
                                          onChange={(event) => {
                                            edit(
                                              i,
                                              "cardRefund",
                                              event.target.value === "card",
                                            );
                                            if (event.target.value === "bank")
                                              edit(i, "creditCardId", "");
                                          }}
                                        >
                                          <option value="bank">
                                            Refund into bank account
                                          </option>
                                          <option value="card">
                                            Refund into credit card
                                          </option>
                                        </select>
                                      </label>
                                    )}
                                  {mode === "scan" &&
                                    (item.record.expenseMode === "Credit" ||
                                      item.record.cardRefund) && (
                                      <label className="import-field import-field-wide">
                                        <span>Credit card</span>
                                        <select
                                          aria-label={`Row ${i + 1} credit card`}
                                          value={item.record.creditCardId || ""}
                                          onChange={(e) =>
                                            edit(
                                              i,
                                              "creditCardId",
                                              e.target.value,
                                            )
                                          }
                                        >
                                          <option value="">
                                            Choose credit card
                                          </option>
                                          {(
                                            accounts.find(
                                              (a) =>
                                                a.id === item.record.account,
                                            )?.creditCards || []
                                          ).map((c: any) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                  {mode === "scan" && (
                                    <label className="import-field">
                                      <span>Currency</span>
                                      <select
                                        aria-label={`Row ${i + 1} currency`}
                                        value={
                                          item.record.currency || "Unknown"
                                        }
                                        onChange={(event) =>
                                          edit(
                                            i,
                                            "currency",
                                            event.target.value,
                                          )
                                        }
                                      >
                                        <option value="Unknown">
                                          Confirm currency
                                        </option>
                                        <option value="INR">INR · ₹</option>
                                        <option value="Other">
                                          Other · convert manually
                                        </option>
                                      </select>
                                    </label>
                                  )}
                                  <label className="import-field">
                                    <span>Expense tag</span>
                                    <select
                                      aria-label={`Row ${i + 1} tag`}
                                      value={item.record.tagId}
                                      onChange={(e) =>
                                        edit(i, "tagId", e.target.value)
                                      }
                                    >
                                      <option value="">
                                        Choose expense tag
                                      </option>
                                      {tags
                                        .filter((t) => t.status === "Active")
                                        .map((t) => (
                                          <option key={t.id} value={t.id}>
                                            {t.name}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                </fieldset>
                              )}
                              {!item.done && !item.attempted && (
                                <CategorySuggestion
                                  row={item.record}
                                  history={rows}
                                  tags={tags}
                                  disabled={busy}
                                  onApply={(id) => edit(i, "tagId", id)}
                                />
                              )}
                              {item.duplicate && !item.done && (
                                <p className="smart-warning">
                                  {duplicateMatches(item.record, rows)[0]
                                    ?.reason ||
                                    "Matches another row in this upload"}
                                  . Skipped by default; select only if it is a
                                  separate transaction.
                                </p>
                              )}
                              {mode === "scan" && !item.done && (
                                <details className="import-review-notes">
                                  <summary>AI review notes</summary>
                                  <p>
                                    Confidence: {item.record.confidence}. Check
                                    the details against your document.
                                  </p>
                                  {(item.record.scanAccountHint ||
                                    item.record.scanCardHint) && (
                                    <p>
                                      Detected account/card:{" "}
                                      {[
                                        item.record.scanAccountHint,
                                        item.record.scanCardHint,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                      . Confirm your choices above.
                                    </p>
                                  )}
                                </details>
                              )}
                              {item.sourceFile && (
                                <small className="import-source">
                                  <FileText size={14} aria-hidden="true" />
                                  <span>
                                    Source receipt: {item.sourceFile.name}
                                    {item.done ? " · Attached" : ""}
                                  </span>
                                </small>
                              )}
                              {item.error && !item.done && (
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
                {receiptTransfer && (
                  <TransferProgress
                    name={receiptTransfer.name}
                    progress={receiptTransfer.progress}
                  />
                )}
                {busy && !scanStage && (
                  <div role="status">
                    <progress
                      value={progress}
                      max={selected.length + progress || 1}
                    />
                    Saved {progress} rows. Keep this window open.
                  </div>
                )}
              </div>
              {mode === "scan" && selected.length > 0 && (
                <label className="scan-confirm">
                  <input
                    type="checkbox"
                    checked={reviewConfirmed}
                    disabled={busy || disabled}
                    onChange={(event) =>
                      setReviewConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    I reviewed the selected entries. Save them to Google Sheets.
                  </span>
                </label>
              )}
              {busy && scanStage && (
                <div role="status" className="scan-progress">
                  <progress />
                  {scanStage}
                </div>
              )}
              <div className="form-footer">
                <button
                  className={importComplete ? "primary" : ""}
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    onClose?.(preview.some((row) => row.done));
                  }}
                >
                  Close
                </button>
                {!importComplete && (
                  <button
                    className="primary"
                    disabled={
                      disabled ||
                      busy ||
                      !selected.length ||
                      (mode === "scan" && !reviewConfirmed)
                    }
                    onClick={() => void commit()}
                  >
                    {busy
                      ? "Importing…"
                      : `Import ${selected.length} selected transactions`}
                  </button>
                )}
              </div>
              {mode === "csv" && (
                <p className="credit-help">
                  CSV imports support up to 500 rows. Review duplicates, tags
                  and transfers before importing. Linked payments belong in the
                  card-bill or loan-payment screens.
                </p>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
