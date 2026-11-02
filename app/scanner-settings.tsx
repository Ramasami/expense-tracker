"use client";
import { useEffect, useRef, useState } from "react";
import {
  scannerStatus,
  saveScannerKey,
  testScannerKey,
} from "../lib/document-scanner";
export default function ScannerSettings({ disabled }: { disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof scannerStatus>
  > | null>(null);
  const [testing, setTesting] = useState(false);
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
      <div className="scanner-test-actions">
        <button
          type="button"
          disabled={disabled || busy || testing || !status?.configured}
          onClick={async () => {
            if (disabled || busy || testing || !status?.configured) return;
            setTesting(true);
            setError("");
            setMessage("Testing saved API key…");
            try {
              const result = await testScannerKey();
              if (!result.ok) throw Error("The key test did not succeed.");
              setMessage(
                `Connection successful · saved key works with ${result.model}. Tested ${new Date(result.testedAt).toLocaleTimeString()}.`,
              );
            } catch (error) {
              setMessage("");
              setError((error as Error).message);
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "Testing…" : "Test saved API key"}
        </button>
        <small>
          Sends one tiny paid AI request using the saved key. No files or
          financial data are sent. Tests are limited to once per minute.
        </small>
      </div>
      {status?.canConfigure && (
        <div className="scanner-key-editor">
          <h4>
            {status.configured
              ? "Replace API key (optional)"
              : "Set up scanner"}
          </h4>
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
              if (busy || testing || disabled || !input.current) return;
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
                placeholder={
                  status.configured
                    ? "Already saved · enter only to replace"
                    : "sk-…"
                }
                disabled={disabled || busy || testing}
              />
            </label>
            <button className="primary" disabled={disabled || busy || testing}>
              {busy ? "Saving…" : "Save API key securely"}
            </button>
          </form>
          <small>
            Sent once over HTTPS to your authenticated Apps Script service.
            Never stored in browser storage, the Sheet or backups, and never
            returned to the app. Saving stores the key; permissions and billing
            are checked when you scan or test the saved key. API billing is
            separate from ChatGPT.
          </small>
        </div>
      )}
      {status && !status.canConfigure && (
        <small>
          Only the service owner can configure the shared scanner key.
          Authorized owners can use the scanner once configured.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      {(!status || error) && (
        <button
          disabled={busy || disabled || testing}
          onClick={() => void check()}
        >
          Check scanner settings again
        </button>
      )}
    </section>
  );
}
