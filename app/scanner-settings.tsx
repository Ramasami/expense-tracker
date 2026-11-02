"use client";
import { useEffect, useRef, useState } from "react";
import {
  scannerStatus,
  saveScannerKey,
  testScannerKey,
  selectScannerProvider,
} from "../lib/document-scanner";
import {
  AI_PROVIDERS,
  GEMINI_PRIVACY,
  type AIProvider,
} from "../lib/ai-providers";
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
  const provider = status?.provider || "openai";
  const spec = AI_PROVIDERS[provider];
  return (
    <section
      className="scanner-settings"
      aria-labelledby="scanner-settings-title"
    >
      <h3 id="scanner-settings-title">AI bill & statement scanner</h3>
      <label className="field scanner-provider">
        AI provider
        <select
          aria-label="AI provider"
          value={provider}
          disabled={disabled || busy || testing || !status?.canConfigure}
          onChange={async (event) => {
            const next = event.target.value as AIProvider;
            if (input.current) input.current.value = "";
            setBusy(true);
            setError("");
            setMessage("");
            try {
              setStatus(await selectScannerProvider(next));
            } catch {
              setError(
                "Could not confirm the provider change. Check settings again before continuing.",
              );
              setStatus(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          {Object.entries(AI_PROVIDERS).map(([id, item]) => (
            <option key={id} value={id}>
              {item.label}
            </option>
          ))}
        </select>
        <small>
          Shared for all owners. Each provider keeps its own saved key; uploads
          never switch providers automatically.
        </small>
      </label>
      {provider === "gemini" && (
        <p className="scanner-privacy">
          {GEMINI_PRIVACY}{" "}
          <a
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
            rel="noreferrer"
          >
            Google data terms ↗
          </a>
        </p>
      )}
      <p role="status">
        {message ||
          (busy
            ? "Checking scanner settings…"
            : status?.configured
              ? "Configured · key saved securely in Apps Script."
              : status
                ? `Add your ${spec.name} API key once to enable scanning.`
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
              const result = await testScannerKey(status.provider);
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
          Sends one small AI request (API charges or free quota apply) using the
          saved key. No files or financial data are sent. Tests are limited to
          once per minute.
        </small>
      </div>
      {status?.canConfigure && (
        <div className="scanner-key-editor">
          <h4>
            {status.configured
              ? "Replace API key (optional)"
              : "Set up scanner"}
          </h4>
          <p>{spec.instructions}</p>
          <a href={spec.keyURL} target="_blank" rel="noreferrer">
            Create {provider === "openai" ? "an" : "a"} {spec.name} API key ↗
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
                setStatus(await saveScannerKey(key, status.provider));
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
              {spec.name} API key
              <input
                ref={input}
                aria-label={`${spec.name} API key`}
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={provider === "openai" ? 19 : 20}
                maxLength={303}
                pattern={
                  provider === "openai"
                    ? "sk-[A-Za-z0-9_\\-]{16,300}"
                    : "[A-Za-z0-9_\\-]{20,300}"
                }
                placeholder={
                  status.configured
                    ? "Already saved · enter only to replace"
                    : provider === "openai"
                      ? "sk-…"
                      : `${spec.name} API key`
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
            separate from ChatGPT and Gemini subscriptions.
          </small>
        </div>
      )}
      <small>
        Local Ollama needs a separately running model server and a secure
        connection from each device. Native Apple Intelligence requires an Apple
        app integration. Neither is available in this browser app.
      </small>
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
