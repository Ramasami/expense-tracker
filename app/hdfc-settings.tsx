"use client";
import { useEffect, useState } from "react";
import {
  hdfcStatus,
  saveHDFC,
  startHDFC,
  disconnectHDFC,
  type HDFCStatus,
} from "../lib/hdfc-portfolio";
import "./hdfc-portfolio.css";
export default function HDFCSettings({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<HDFCStatus | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [apiKey, setKey] = useState(""),
    [apiSecret, setSecret] = useState(""),
    [clientId, setClient] = useState(""),
    [callback, setCallback] = useState("");
  useEffect(() => {
    setCallback(
      window.location.origin +
        (process.env.NEXT_PUBLIC_APP_BASE_PATH || "") +
        "/hdfc-connect/",
    );
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hdfc-settings">
      <h3>HDFC Securities</h3>
      <p>
        Your personal portfolio ·{" "}
        {status?.connected
          ? "Connected"
          : status?.configured
            ? "Login required"
            : "Open to manage connection"}
      </p>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open && !status && !busy && !disabled)
            void run(async () => setStatus(await hdfcStatus()));
        }}
      >
        <summary>
          {status?.configured
            ? "Manage connection"
            : "Connect or manage portfolio"}
        </summary>
        <div className="hdfc-setup-body">
          <p>
            Create an InvestRight developer app, then enter its credentials
            here.
          </p>
          <a
            href="https://developer.hdfcsec.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open HDFC developer portal ↗
          </a>
          <label className="field">
            Redirect / callback URL
            <input
              aria-label="HDFC callback URL"
              value={callback}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                try {
                  setStatus(await saveHDFC(apiKey, apiSecret, clientId));
                  setMessage("Credentials saved. Connect HDFC to finish.");
                } finally {
                  setKey("");
                  setSecret("");
                  setClient("");
                }
              });
            }}
          >
            <fieldset disabled={busy || disabled} className="hdfc-credentials">
              <label className="field">
                HDFC client ID
                <input
                  aria-label="HDFC client ID"
                  value={clientId}
                  onChange={(e) => setClient(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                API key
                <input
                  aria-label="HDFC API key"
                  value={apiKey}
                  onChange={(e) => setKey(e.target.value)}
                  required
                  maxLength={512}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                API secret
                <input
                  aria-label="HDFC API secret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setSecret(e.target.value)}
                  required
                  maxLength={512}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit">
                {status?.configured
                  ? "Replace credentials"
                  : "Save credentials"}
              </button>
            </fieldset>
          </form>
          {status?.configured && (
            <div className="hdfc-connection-actions">
              <button
                disabled={busy || disabled}
                className="primary"
                onClick={() =>
                  void run(async () => {
                    window.location.assign(await startHDFC());
                  })
                }
              >
                {status.connected ? "Reconnect HDFC" : "Connect HDFC"}
              </button>
              <button
                disabled={busy || disabled}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove your saved HDFC credentials and connection? Your broker holdings stay unchanged.",
                    )
                  )
                    void run(async () => {
                      setStatus(await disconnectHDFC());
                      setMessage("HDFC disconnected.");
                    });
                }}
              >
                Disconnect
              </button>
              <small>Client {status.clientHint}</small>
            </div>
          )}
          <small>
            Complete login and 2FA on HDFC. Portfolio viewing only; no order
            placement.
          </small>
        </div>
      </details>
      {busy && <p role="status">Updating HDFC connection…</p>}
      {message && (
        <p className="hdfc-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="hdfc-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
