"use client";
import { useEffect, useState } from "react";
import {
  configureRememberedLogin,
  currentGoogleSession,
  loadGoogleIdentity,
  rememberedLoginStatus,
  rememberThisDevice,
  type GoogleSession,
} from "../lib/google-auth";
export default function SessionSettings({
  disabled,
  onRemember,
}: {
  disabled: boolean;
  onRemember: (session: GoogleSession) => void;
}) {
  const [status, setStatus] = useState<{
    configured: boolean;
    canConfigure: boolean;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const until = currentGoogleSession()?.rememberedUntil;
  useEffect(() => {
    void rememberedLoginStatus()
      .then(setStatus)
      .catch(() => setMessage("Connect and retry to check remembered login."));
    void loadGoogleIdentity().catch(() => {});
  }, []);
  return (
    <section className="session-settings">
      <h3>Remembered login</h3>
      <p>
        {until
          ? `This device is remembered until ${new Date(until).toLocaleDateString()}.`
          : "Keep this device signed in for 30 days."}
      </p>
      {!until && (
        <button
          disabled={disabled || busy || !status?.configured}
          onClick={() => {
            setBusy(true);
            setMessage("");
            void rememberThisDevice()
              .then((session) => {
                onRemember(session);
                setMessage("This device is now remembered.");
              })
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Connecting…" : "Remember this device"}
        </button>
      )}
      {status && !status.configured && (
        <p>One-time server setup is required by the app owner.</p>
      )}
      {status?.canConfigure && (
        <details open={!status.configured}>
          <summary>Google login setup</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const value = secret;
              setSecret("");
              try {
                setStatus(await configureRememberedLogin(value));
                setMessage(
                  "Setup saved. Choose Remember this device and approve Google access once.",
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Google OAuth client secret
              <input
                aria-label="Google OAuth client secret"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
                maxLength={256}
              />
            </label>
            <small>
              Use the secret for the existing Web OAuth client—not an AI API
              key. Saved only in Apps Script.
            </small>
            <button disabled={disabled || busy || !secret.trim()}>
              Save login setup
            </button>
          </form>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {!status && message && (
        <button
          disabled={disabled || busy}
          onClick={() => {
            setBusy(true);
            void rememberedLoginStatus()
              .then((value) => {
                setStatus(value);
                setMessage("");
              })
              .catch((error) => setMessage(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Retry login setup check
        </button>
      )}
    </section>
  );
}
