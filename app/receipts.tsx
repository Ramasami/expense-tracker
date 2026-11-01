"use client";
import { useEffect, useRef, useState } from "react";
import { RecordData } from "../lib/finance";
import { Receipt, receiptBlob, uploadReceipt } from "../lib/receipts";
function ReceiptView({ receipt }: { receipt: Receipt }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    receiptBlob(receipt)
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [receipt.id, receipt.mimeType]);
  if (error) return <p role="alert">{error}</p>;
  if (!url) return <p role="status">Loading receipt…</p>;
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
  const pending = useRef<Receipt | null>(null);
  const receipts: Receipt[] = Array.isArray(transaction.receipts)
    ? transaction.receipts
    : [];
  return (
    <section className="receipts">
      <h3>Bills & receipts</h3>
      <p>
        Attach an image or PDF up to 5 MB. Files are saved to Google Drive and
        shared with Ram and Varsha. Open a receipt to load it.
      </p>
      <label className="receipt-upload">
        {busy ? "Uploading and saving receipt…" : "Upload bill or receipt"}
        <input
          aria-label="Upload bill or receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={disabled || busy || receipts.length >= 20}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              pending.current = await uploadReceipt(file, transaction.id);
              const next = [
                ...receipts.filter((r) => r.id !== pending.current!.id),
                pending.current,
              ];
              await onAttach(next);
              pending.current = null;
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
              event.target.value = "";
            }
          }}
        />
      </label>
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
