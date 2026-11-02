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
  const inputs = useRef<Partial<Record<AIProvider, HTMLInputElement | null>>>(
    {},
  );
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof scannerStatus>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [testing, setTesting] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setStatus(await scannerStatus());
    } catch {
      setStatus(null);
      setError("Could not check AI settings. Reconnect and try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  const provider = status?.provider || "openai";
  const saved = (id: AIProvider) =>
    status?.providers?.find((item) => item.provider === id)?.configured ??
    (id === provider && !!status?.configured);
  const available = (Object.keys(AI_PROVIDERS) as AIProvider[]).filter(saved);
  const locked = disabled || busy || testing;
  return (
    <section
      className="scanner-settings"
      aria-labelledby="scanner-settings-title"
    >
      <h3 id="scanner-settings-title">AI bill & statement scanner</h3>
      <div className="scanner-key-list">
        {(
          Object.entries(AI_PROVIDERS) as [
            AIProvider,
            (typeof AI_PROVIDERS)[AIProvider],
          ][]
        ).map(([id, spec]) => (
          <div className="scanner-key-row" data-provider={id} key={id}>
            <div className="scanner-key-heading">
              <h4>{spec.label}</h4>
              <span className={saved(id) ? "key-saved" : ""}>
                {saved(id) ? "Saved" : "Not added"}
              </span>
            </div>
            {status?.canConfigure && (
              <>
                <form
                  autoComplete="off"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const input = inputs.current[id];
                    if (locked || !input) return;
                    let key = input.value.trim();
                    if (
                      id === "openai"
                        ? !/^sk-[A-Za-z0-9_-]{16,300}$/.test(key)
                        : !/^[\x21-\x7e]{20,2048}$/.test(key)
                    ) {
                      setError(
                        `Paste only the ${spec.name} API key, without labels or spaces.`,
                      );
                      key = "";
                      return;
                    }
                    input.value = "";
                    setBusy(true);
                    setError("");
                    setMessage("");
                    try {
                      setStatus(await saveScannerKey(key, id));
                      setMessage("API key saved securely.");
                    } catch {
                      setStatus(null);
                      setError(
                        "Could not confirm saving the key. Check AI settings before trying again.",
                      );
                    } finally {
                      key = "";
                      setBusy(false);
                    }
                  }}
                >
                  <label className="field">
                    <span className="sr-only">{spec.name} API key</span>
                    <input
                      ref={(element) => {
                        inputs.current[id] = element;
                      }}
                      aria-label={`${spec.name} API key`}
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={4096}
                      placeholder={
                        saved(id)
                          ? "Saved · enter only to replace"
                          : "Enter API key"
                      }
                      disabled={locked}
                    />
                  </label>
                  <button
                    type="submit"
                    aria-label={`Save ${spec.name} API key`}
                    disabled={locked}
                  >
                    Save
                  </button>
                </form>
                <div className="scanner-key-hint">
                  <a href={spec.keyURL} target="_blank" rel="noreferrer">
                    Get key ↗
                  </a>
                  <small>{spec.instructions}</small>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <label className="field scanner-provider">
        Use for uploads
        <select
          aria-label="AI provider"
          value={saved(provider) ? provider : ""}
          disabled={locked || !status?.canConfigure || !available.length}
          onChange={async (event) => {
            const next = event.target.value as AIProvider;
            setBusy(true);
            setError("");
            setMessage("");
            try {
              setStatus(await selectScannerProvider(next));
            } catch {
              setStatus(null);
              setError(
                "Could not confirm the provider change. Check AI settings again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {!saved(provider) && (
            <option value="">
              {available.length
                ? "Choose a saved provider"
                : "Add an API key first"}
            </option>
          )}
          {available.map((id) => (
            <option key={id} value={id}>
              {AI_PROVIDERS[id].label}
            </option>
          ))}
        </select>
      </label>
      <p role="status">
        {message ||
          (busy
            ? "Updating AI settings…"
            : status?.configured
              ? "Configured · ready to analyze."
              : status
                ? "Save a key, then choose which AI to use."
                : "AI settings unavailable.")}
      </p>
      <div className="scanner-test-actions">
        <button
          type="button"
          disabled={locked || !status?.configured}
          onClick={async () => {
            if (locked || !status?.configured) return;
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
        <small>Tests the selected AI. API charges may apply.</small>
      </div>
      {status && !status.canConfigure && (
        <small>Only the service owner can change AI settings.</small>
      )}
      {error && <p role="alert">{error}</p>}
      {(!status || error) && (
        <button disabled={locked} onClick={() => void check()}>
          Check scanner settings again
        </button>
      )}
    </section>
  );
}
