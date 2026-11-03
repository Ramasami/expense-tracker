import { sessionRequest } from "./session-service";
import { SHEET_ID } from "./public-sheet";
import { INITIAL_OWNERS, ownerEmails } from "./owners";
const SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid email profile";
export type GoogleSession = {
  email: string;
  name: string;
  expiresAt: number;
  offline?: boolean;
  rememberedUntil?: number;
  ownerId?: string;
  ownerName?: string;
};
let token = "";
let session: GoogleSession | null = null;
let loading: Promise<void> | null = null;
let authEpoch = 0;
let restoring: Promise<GoogleSession | null> | null = null;
export const CLIENT_KEY = "wealthtrack-google-client-id";
export const SESSION_KEY = "wealthtrack-google-session";
export function currentGoogleSession() {
  if (session && session.expiresAt > Date.now() + 30000) return session;
  if (session && (session.rememberedUntil || 0) > Date.now()) {
    session = { ...session, offline: true };
    return session;
  }
  if (session) disconnectGoogle();
  return null;
}
export function googleToken() {
  if (!currentGoogleSession())
    throw Error("Sign in to Google to access your sheet.");
  if (session?.offline || (session?.expiresAt || 0) <= Date.now() + 30000)
    throw Error(
      "You are offline. Reconnect and sync before making Google requests.",
    );
  return token;
}
export function configuredClientId() {
  return (
    localStorage.getItem(CLIENT_KEY) ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "596898834710-uimpamt17opolc3u06n78i6t9vhq0efj.apps.googleusercontent.com"
  );
}
export function saveClientId(id: string) {
  const clean = id.trim();
  if (!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clean))
    throw Error(
      "Enter a Google Web application client ID ending in .apps.googleusercontent.com.",
    );
  localStorage.setItem(CLIENT_KEY, clean);
}
async function verifyProfile(
  accessToken: string,
  expiresAt: number,
): Promise<GoogleSession> {
  const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (user.status === 429 || user.status >= 500)
    throw new TypeError(
      "Google account verification is temporarily unavailable.",
    );
  if (!user.ok)
    throw Error("Could not verify the Google account. Sign in again.");
  const profile = await user.json();
  const email = String(profile.email || "")
    .trim()
    .toLowerCase();
  if (profile.email_verified !== true || !email)
    throw Error(
      "This Google account is not authorized. Sign in with Ram's or Varsha's approved account.",
    );
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30000)
    throw Error("Your Google session expired. Sign in again.");
  const access = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?ranges=${encodeURIComponent("'App Settings'!A1:H10000")}`,
    {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (access.status >= 500 || access.status === 429)
    throw new TypeError(
      "Sheet access could not be checked. Reconnect and retry.",
    );
  if (!access.ok)
    throw Error(
      "This Google account is not authorized to access the Budget Sheet. Ask the Sheet owner for access.",
    );
  const rows = (await access.json()).valueRanges?.[0]?.values || [];
  const registered = rows
    .slice(1)
    .filter((row: any[]) => row[0])
    .map((row: any[]) => ({
      ...JSON.parse(row[7] || "{}"),
      id: String(row[0]),
      status: row[1] || "Active",
    }))
    .filter((row: any) => row.kind === "owner");
  const owners = registered.length ? registered : INITIAL_OWNERS;
  const owner = owners.find(
    (owner: any) =>
      owner.status === "Active" && ownerEmails(owner).includes(email),
  );
  if (!owner)
    throw Error(
      "This Google account is not authorized. Add its email to an active owner in the Budget Sheet first.",
    );
  return {
    email,
    name: profile.name || email,
    expiresAt,
    ownerId: owner.id,
    ownerName: owner.name,
  };
}
export function restoreGoogleSession(): Promise<GoogleSession | null> {
  if (restoring) return restoring;
  restoring = restoreSavedSession(authEpoch).finally(() => {
    restoring = null;
  });
  return restoring;
}
async function restoreSavedSession(
  expectedEpoch: number,
): Promise<GoogleSession | null> {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const remembered =
      typeof saved.deviceToken === "string" &&
      /^[a-f0-9]{96}$/.test(saved.deviceToken) &&
      Number.isFinite(saved.rememberedUntil) &&
      saved.rememberedUntil > Date.now();
    if (
      typeof saved.accessToken !== "string" ||
      !saved.accessToken ||
      !Number.isFinite(saved.expiresAt) ||
      (saved.expiresAt <= Date.now() + 30000 && !remembered)
    ) {
      disconnectGoogle();
      return null;
    }
    // Never trust an identity stored by the browser: revalidate it with Google.
    const offlineProfile = () => {
      if (
        !saved.verifiedEmail ||
        (!saved.ownerId &&
          !INITIAL_OWNERS.some((owner) =>
            ownerEmails(owner).includes(saved.verifiedEmail),
          )) ||
        !Number.isFinite(saved.verifiedAt) ||
        saved.verifiedAt > Date.now()
      )
        throw Error(
          "Connect to Google once to verify this saved login before using the app offline.",
        );
      return {
        email: saved.verifiedEmail,
        name: String(saved.displayName || saved.verifiedEmail),
        expiresAt: saved.expiresAt,
        offline: true,
        rememberedUntil: remembered ? saved.rememberedUntil : undefined,
        ownerId:
          saved.ownerId ||
          INITIAL_OWNERS.find((owner) =>
            ownerEmails(owner).includes(saved.verifiedEmail),
          )?.id,
        ownerName:
          saved.ownerName ||
          INITIAL_OWNERS.find((owner) =>
            ownerEmails(owner).includes(saved.verifiedEmail),
          )?.name,
      };
    };
    let verified: GoogleSession;
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      verified = offlineProfile();
    else {
      try {
        if (remembered) {
          const renewed = await sessionRequest("restoreSession", {
            deviceToken: saved.deviceToken,
          });
          if (expectedEpoch !== authEpoch) return null;
          if (
            renewed.email !== saved.verifiedEmail ||
            typeof renewed.accessToken !== "string" ||
            !renewed.accessToken ||
            !Number.isFinite(renewed.expiresAt) ||
            !Number.isFinite(renewed.rememberedUntil) ||
            renewed.rememberedUntil !== saved.rememberedUntil
          )
            throw Error(
              "Remembered account could not be verified. Sign in again.",
            );
          saved.accessToken = renewed.accessToken;
          saved.expiresAt = renewed.expiresAt;
        }
        verified = await verifyProfile(saved.accessToken, saved.expiresAt);
        if (remembered) verified.rememberedUntil = saved.rememberedUntil;
      } catch (error) {
        if (
          error instanceof TypeError ||
          (error as Error).name === "AbortError" ||
          (error as Error).name === "TimeoutError"
        )
          verified = offlineProfile();
        else throw error;
      }
    }
    if (expectedEpoch !== authEpoch) return null;
    // Persist only the short-lived credential, never financial records or a trusted identity.
    // Migrates logins saved by the previous tab-only version after Google verifies them.
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: saved.accessToken,
        expiresAt: saved.expiresAt,
        ...(remembered
          ? {
              deviceToken: saved.deviceToken,
              rememberedUntil: saved.rememberedUntil,
            }
          : {}),
        verifiedEmail: verified.email,
        displayName: verified.name,
        ownerId: verified.ownerId,
        ownerName: verified.ownerName,
        verifiedAt: verified.offline ? saved.verifiedAt : Date.now(),
      }),
    );
    sessionStorage.removeItem(SESSION_KEY);
    token = saved.accessToken;
    session = verified;
    return verified;
  } catch (error) {
    if (expectedEpoch !== authEpoch) return null;
    disconnectGoogle();
    throw error;
  }
}
export function loadGoogleIdentity(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(
        Error(
          "Google sign-in could not load. Check your connection and try again.",
        ),
      );
    };
    document.head.append(script);
  });
  return loading;
}
export function signInGoogle(): Promise<GoogleSession> {
  authEpoch++;
  const clientId = configuredClientId();
  if (!clientId)
    throw Error("Set your Google Web OAuth client ID before signing in.");
  if (!(window as any).google?.accounts?.oauth2)
    throw Error("Google sign-in is still loading. Try again in a moment.");
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      include_granted_scopes: true,
      callback: async (response: any) => {
        try {
          if (response.error)
            throw Error(response.error_description || response.error);
          const granted = new Set(String(response.scope || "").split(" "));
          if (!granted.has("https://www.googleapis.com/auth/spreadsheets"))
            throw Error("Grant Google Sheets access to save records.");
          if (
            typeof response.access_token !== "string" ||
            !response.access_token
          )
            throw Error("Google did not return an access token.");
          const expiresAt =
            Date.now() + Number(response.expires_in || 3600) * 1000;
          const verified = await verifyProfile(
            response.access_token,
            expiresAt,
          );
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              accessToken: response.access_token,
              expiresAt,
              verifiedEmail: verified.email,
              displayName: verified.name,
              ownerId: verified.ownerId,
              ownerName: verified.ownerName,
              verifiedAt: Date.now(),
            }),
          );
          token = response.access_token;
          session = verified;
          resolve(verified);
        } catch (error) {
          disconnectGoogle();
          reject(error);
        }
      },
      error_callback: (e: any) =>
        reject(
          Error(
            e.type === "popup_closed"
              ? "Google sign-in was cancelled."
              : "Google sign-in could not open. Allow the popup and try again.",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export function disconnectGoogle() {
  authEpoch++;
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    if (saved.deviceToken)
      void sessionRequest("revokeSession", {
        deviceToken: saved.deviceToken,
      }).catch(() => {});
  } catch {
    /* Local sign-out still completes offline. */
  }
  token = "";
  session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Memory is always cleared. */
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Clear the legacy store independently. */
  }
}

export function rememberedLoginStatus(): Promise<{
  configured: boolean;
  canConfigure: boolean;
}> {
  return sessionRequest("sessionStatus", { token: googleToken() });
}
export function configureRememberedLogin(
  clientSecret: string,
): ReturnType<typeof rememberedLoginStatus> {
  return sessionRequest("configureSession", {
    token: googleToken(),
    clientSecret,
  });
}
export function rememberThisDevice(): Promise<GoogleSession> {
  const current = currentGoogleSession();
  const accessToken = googleToken(),
    expectedEpoch = authEpoch;
  if (!current) throw Error("Sign in first.");
  const oauth = (window as any).google?.accounts?.oauth2;
  if (!oauth?.initCodeClient)
    throw Error("Google authorization is still loading. Try again.");
  return new Promise((resolve, reject) => {
    const client = oauth.initCodeClient({
      client_id: configuredClientId(),
      scope: SCOPE,
      ux_mode: "popup",
      hint: current.email,
      select_account: false,
      callback: async (response: any) => {
        try {
          if (response.error || typeof response.code !== "string")
            throw Error("Google authorization was not completed.");
          const result = await sessionRequest("createSession", {
            token: accessToken,
            code: response.code,
            origin: window.location.origin,
          });
          if (expectedEpoch !== authEpoch) {
            if (result.deviceToken)
              void sessionRequest("revokeSession", {
                deviceToken: result.deviceToken,
              }).catch(() => {});
            throw Error("Login changed. Sign in again.");
          }
          if (
            !/^[a-f0-9]{96}$/.test(result.deviceToken) ||
            !Number.isFinite(result.rememberedUntil) ||
            result.rememberedUntil <= Date.now() ||
            result.rememberedUntil > Date.now() + 30 * 86400000 + 60000 ||
            result.email !== current.email
          )
            throw Error("Remembered login could not be verified.");
          const verified = await verifyProfile(
            result.accessToken,
            result.expiresAt,
          );
          if (expectedEpoch !== authEpoch || verified.email !== current.email)
            throw Error("Login changed. Sign in again.");
          verified.rememberedUntil = result.rememberedUntil;
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              accessToken: result.accessToken,
              expiresAt: result.expiresAt,
              deviceToken: result.deviceToken,
              rememberedUntil: result.rememberedUntil,
              verifiedEmail: verified.email,
              displayName: verified.name,
              ownerId: verified.ownerId,
              ownerName: verified.ownerName,
              verifiedAt: Date.now(),
            }),
          );
          token = result.accessToken;
          session = verified;
          resolve(verified);
        } catch (error) {
          reject(error);
        }
      },
      error_callback: () =>
        reject(
          Error(
            "Google authorization was cancelled or could not open. Try again.",
          ),
        ),
    });
    client.requestCode();
  });
}
