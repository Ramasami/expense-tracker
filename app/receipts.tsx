"use client";
import { useEffect, useState } from "react";
import { RecordData } from "../lib/finance";
import {
  Receipt,
  ReceiptProgress,
  receiptBlob,
  uploadReceipt,
  validateReceipt,
} from "../lib/receipts";
function TransferProgress({
  name,
  progress,
}: {
  name: string;
  progress: ReceiptProgress;
}) {
  const labels = {
    checking: "Checking",
    compressing: "Compressing",
    uploading: "Uploading",
    sharing: "Sharing with the other account",
    done: "Uploaded to Drive",
    failed: "Failed",
    downloading: "Downloading",
  };
  const percent = progress.total
    ? Math.min(100, Math.floor((100 * progress.loaded) / progress.total))
    : undefined;
  return (
    <div className="receipt-progress">
      <span>
        {name} · {labels[progress.stage]}
        {percent !== undefined ? ` · ${percent}%` : "…"}
      </span>
      <progress
        aria-label={`${progress.stage === "downloading" ? "Download" : "Upload"} progress for ${name}`}
        max={100}
        value={percent}
      />
      {progress.total && (
        <small>
          {Math.round(progress.loaded / 1024)} /{" "}
          {Math.round(progress.total / 1024)} KB
        </small>
      )}
    </div>
  );
}
function ReceiptView({ receipt }: { receipt: Receipt }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ReceiptProgress>({
    stage: "downloading",
    loaded: 0,
    total: receipt.size,
  });
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    const controller = new AbortController();
    receiptBlob(
      receipt,
      (value) => {
        if (!disposed) setProgress(value);
      },
      controller.signal,
    )
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [receipt.id, receipt.mimeType]);
  if (error) return <p role="alert">{error}</p>;
  if (!url) return <TransferProgress name={receipt.name} progress={progress} />;
  return receipt.mimeType.startsWith("image/") ? (
    <img
      className="receipt-image"
      loading="lazy"
      src={url}
      alt={receipt.name}
    />
  ) : (
    <a href={url} download={receipt.name}>
      Download {receipt.name}
    </a>
  );
}
export default function Receipts({
  transaction,
  disabled,
  onAttach,
}: {
  transaction: RecordData;
  disabled: boolean;
  onAttach: (receipts: Receipt[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [jobs, setJobs] = useState<
    { name: string; progress: ReceiptProgress }[]
  >([]);
  const receipts: Receipt[] = Array.isArray(transaction.receipts)
    ? transaction.receipts
    : [];
  return (
    <section className="receipts">
      <h3>Bills & receipts</h3>
      <p>
        Select multiple images or PDFs. Large photos are compressed
        automatically. Images up to 20 MB; PDFs up to 5 MB; 20 receipts per
        transaction. Files are saved to Google Drive and shared with Ram and
        Varsha. Open a receipt to load it.
      </p>
      <label className="receipt-upload">
        {busy ? progress : "Upload bills or receipts"}
        <input
          aria-label="Upload bill or receipt"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={disabled || busy || receipts.length >= 20}
          onChange={async (event) => {
            const input = event.target;
            const files = Array.from(input.files || []);
            if (!files.length) return;
            setBusy(true);
            setError("");
            setJobs(
              files.map((file) => ({
                name: file.name,
                progress: { stage: "checking", loaded: 0 },
              })),
            );
            setProgress(
              `Preparing ${files.length} receipt${files.length === 1 ? "" : "s"}…`,
            );
            try {
              if (receipts.length + files.length > 20)
                throw Error(
                  "A transaction can have up to 20 receipts. Select fewer files.",
                );
              files.forEach(validateReceipt);
              let nextIndex = 0;
              let completed = 0;
              const uploaded: Receipt[] = [];
              const failures: string[] = [];
              async function worker() {
                while (nextIndex < files.length) {
                  const index = nextIndex++;
                  const file = files[index];
                  const report = (progress: ReceiptProgress) =>
                    setJobs((current) =>
                      current.map((job, i) =>
                        i === index ? { ...job, progress } : job,
                      ),
                    );
                  try {
                    uploaded.push(
                      await uploadReceipt(file, transaction.id, report),
                    );
                  } catch (e: any) {
                    failures.push(file.name + ": " + e.message);
                    report({ stage: "failed", loaded: 0 });
                  }
                  completed++;
                  setProgress(
                    `Processed ${completed} of ${files.length} files…`,
                  );
                }
              }
              await Promise.all(
                Array.from({ length: Math.min(2, files.length) }, () =>
                  worker(),
                ),
              );
              if (uploaded.length) {
                setProgress("Saving receipt links to Google Sheets…");
                const links = new Map(
                  receipts.map((receipt) => [receipt.id, receipt]),
                );
                uploaded.forEach((receipt) => links.set(receipt.id, receipt));
                await onAttach(Array.from(links.values()));
                const before = uploaded.reduce(
                  (sum, receipt) =>
                    sum + (receipt.originalSize || receipt.size),
                  0,
                );
                const after = uploaded.reduce(
                  (sum, receipt) => sum + receipt.size,
                  0,
                );
                setProgress(
                  `${uploaded.length} receipt${uploaded.length === 1 ? "" : "s"} saved${after < before ? ` · ${Math.round(100 * (1 - after / before))}% smaller` : ""}.`,
                );
              }
              if (failures.length)
                setError(
                  `${uploaded.length} saved; ${failures.length} failed. Retry the failed files. ${failures.join(" ")}`,
                );
            } catch (e: any) {
              setError(e.message);
              setProgress("");
              setJobs((current) =>
                current.map((job) =>
                  job.progress.stage === "done"
                    ? job
                    : { ...job, progress: { stage: "failed", loaded: 0 } },
                ),
              );
            } finally {
              setBusy(false);
              input.value = "";
            }
          }}
        />
      </label>
      {jobs.map((job, index) => (
        <TransferProgress key={index} name={job.name} progress={job.progress} />
      ))}
      {!busy && progress && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      {receipts.map((receipt) => (
        <div className="receipt-item" key={receipt.id}>
          <button
            type="button"
            aria-expanded={opened === receipt.id}
            onClick={() => setOpened(opened === receipt.id ? null : receipt.id)}
          >
            {opened === receipt.id ? "Close" : "View"} {receipt.name}
          </button>
          {opened === receipt.id && <ReceiptView receipt={receipt} />}
        </div>
      ))}
      {!receipts.length && <small>No receipts attached yet.</small>}
    </section>
  );
}
