"use client";
import { useEffect, useRef, useState } from "react";
import {
  restoreGoogleSession,
  loadGoogleIdentity,
  signInGoogle,
  type GoogleSession,
} from "../../lib/google-auth";
import {
  HDFC_FLOW_KEY,
  finishHDFC,
  pendingHDFC,
} from "../../lib/hdfc-portfolio";
import "../hdfc-portfolio.css";
export default function HDFCConnect() {
  const [token, setToken] = useState(""),
    [flow, setFlow] = useState(""),
    [session, setSession] = useState<GoogleSession | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const initialized = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (initialized.current)
      return () => {
        mounted.current = false;
      };
    initialized.current = true;
    const url = new URL(window.location.href),
      returned = url.searchParams.get("request_token") || "";
    window.history.replaceState(null, "", url.pathname);
    setToken(returned);
    const localFlow = sessionStorage.getItem(HDFC_FLOW_KEY) || "";
    setFlow(localFlow);
    restoreGoogleSession()
      .then(async (s) => {
        if (mounted.current) setSession(s);
        if (!s && returned) await loadGoogleIdentity();
        if (s && !s.offline && returned && !localFlow) {
          const pending = await pendingHDFC();
          if (mounted.current) setFlow(pending.flowId || "");
        }
      })
      .catch((error) => {
        if (mounted.current)
          setError(
            error.message || "Sign in with Google to complete the connection.",
          );
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function connect() {
    if (!session || !token || !flow || busy) return;
    setBusy(true);
    setError("");
    try {
      await finishHDFC(token, flow);
      setDone(true);
      setToken("");
      sessionStorage.removeItem(HDFC_FLOW_KEY);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hdfc-callback">
      <section className="card">
        <span className="hdfc-kicker">BUDGET TRACKER × HDFC SECURITIES</span>
        <h1>{done ? "Portfolio connected" : "Finish connecting HDFC"}</h1>
        <p>
          {done
            ? "Your delivery holdings are ready under Investments."
            : "Confirm this broker login for your signed-in Google account. Your HDFC client ID must match the one saved in Settings."}
        </p>
        {busy && <p role="status">Checking connection…</p>}
        {!busy && !done && (!token || (session && !flow)) && (
          <p className="hdfc-error" role="alert">
            No matching HDFC connection was started for this Google account.
            Return to Settings and connect again.
          </p>
        )}
        {!busy && !session && token && (
          <button
            onClick={async () => {
              setBusy(true);
              try {
                const signed = await signInGoogle();
                setSession(signed);
                if (token && !flow) {
                  const pending = await pendingHDFC();
                  setFlow(pending.flowId || "");
                }
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign in with Google
          </button>
        )}
        {session && !done && token && flow && (
          <button
            className="primary"
            disabled={busy || session.offline}
            onClick={() => void connect()}
          >
            Connect HDFC for {session.ownerName || session.name}
          </button>
        )}
        {session?.offline && (
          <p role="alert" className="hdfc-error">
            Connect to the internet and verify your Google session before
            finishing HDFC login.
          </p>
        )}
        {error && (
          <p role="alert" className="hdfc-error">
            {error}
          </p>
        )}
        <a href={(process.env.NEXT_PUBLIC_APP_BASE_PATH || "") + "/"}>
          Return to Budget Tracker →
        </a>
      </section>
    </main>
  );
}
