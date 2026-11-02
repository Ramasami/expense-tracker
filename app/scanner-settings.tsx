"use client";
import { useEffect, useRef, useState } from "react";
import { scannerStatus, saveScannerKey } from "../lib/document-scanner";
export default function ScannerSettings({ disabled }: { disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof scannerStatus>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    try {
      setStatus(await scannerStatus());
    } catch {
      setError("Could not check scanner settings. Reconnect and try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  return (
    <section
      className="scanner-settings"
      aria-labelledby="scanner-settings-title"
    >
      <h3 id="scanner-settings-title">AI bill & statement scanner</h3>
      <p role="status">
        {message ||
          (busy
            ? "Checking scanner settings…"
            : status?.configured
              ? "Configured · key saved securely in Apps Script."
              : status
                ? "Add your OpenAI API key once to enable scanning."
                : "Scanner configuration unavailable.")}
      </p>
      {status?.canConfigure && (
        <details open={!status.configured}>
          <summary>
            {status.configured ? "Replace API key" : "Set up scanner"}
          </summary>
          <p>
            Create a <b>Restricted project API key</b> with{" "}
            <b>Responses → Write</b> permission. Read-only cannot analyze
            documents. Other endpoints can stay disabled; no Files permission is
            required. Ensure the project has API billing and access to the
            configured model.
          </p>
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            Create an OpenAI API key ↗
          </a>
          <form
            autoComplete="off"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || disabled || !input.current) return;
              let key = input.current.value.trim();
              input.current.value = "";
              setBusy(true);
              setError("");
              setMessage("");
              try {
                setStatus(await saveScannerKey(key));
                setMessage(
                  "API key saved securely. Setup is complete; the key will not be requested again.",
                );
              } catch {
                setError(
                  "The service did not confirm saving the key. Check your connection and service-owner sign-in, then retry.",
                );
              } finally {
                key = "";
                setBusy(false);
              }
            }}
          >
            <label className="field">
              OpenAI API key
              <input
                ref={input}
                aria-label="OpenAI API key"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={19}
                maxLength={303}
                pattern="sk-[A-Za-z0-9_\-]{16,300}"
                placeholder="sk-…"
                disabled={disabled || busy}
              />
            </label>
            <button className="primary" disabled={disabled || busy}>
              {busy ? "Saving…" : "Save API key securely"}
            </button>
          </form>
          <small>
            Sent once over HTTPS to your authenticated Apps Script service.
            Never stored in browser storage, the Sheet or backups, and never
            returned to the app. Saving stores the key; permissions and billing
            are checked when you scan. API billing is separate from ChatGPT.
          </small>
        </details>
      )}
      {status && !status.canConfigure && (
        <small>
          Only the service owner can configure the shared scanner key.
          Authorized owners can use the scanner once configured.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      {(!status || error) && (
        <button disabled={busy || disabled} onClick={() => void check()}>
          Check scanner settings again
        </button>
      )}
    </section>
  );
}
