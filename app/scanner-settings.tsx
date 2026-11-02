"use client";
import { useEffect, useRef, useState } from "react";
import {
  scannerStatus,
  saveScannerKey,
  testScannerKey,
  selectScannerProvider,
} from "../lib/document-scanner";
import { AI_PROVIDERS, type AIProvider } from "../lib/ai-providers";
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
          Applies to all owners. Saved keys are kept when switching.
        </small>
      </label>
      <p role="status">
        {message ||
          (busy
            ? "Checking scanner settings…"
            : status?.configured
              ? "Configured · API key saved."
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
                `Connection successful · tested ${new Date(result.testedAt).toLocaleTimeString()}.`,
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
        <small>Checks connection only. API charges may apply.</small>
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
                  "API key saved securely. No need to enter it again.",
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
          <small>Your key stays saved across devices.</small>
        </div>
      )}
      {status && !status.canConfigure && (
        <small>Only the service owner can change AI settings.</small>
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
