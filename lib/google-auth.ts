const SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid email profile";
const ALLOWED_EMAILS = new Set([
  "ramasami.official@gmail.com",
  "tnvarsha.99@gmail.com",
]);
export type GoogleSession = { email: string; name: string; expiresAt: number };
let token = "";
let session: GoogleSession | null = null;
let loading: Promise<void> | null = null;
export const CLIENT_KEY = "wealthtrack-google-client-id";
export const SESSION_KEY = "wealthtrack-google-session";
export function currentGoogleSession() {
  if (session && session.expiresAt > Date.now() + 30000) return session;
  if (session) disconnectGoogle();
  return null;
}
export function googleToken() {
  if (!currentGoogleSession())
    throw Error("Sign in to Google to access your sheet.");
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
  if (!user.ok)
    throw Error("Could not verify the Google account. Sign in again.");
  const profile = await user.json();
  const email = String(profile.email || "")
    .trim()
    .toLowerCase();
  if (profile.email_verified !== true || !ALLOWED_EMAILS.has(email))
    throw Error(
      "This Google account is not authorized. Sign in with Ram's or Varsha's approved account.",
    );
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30000)
    throw Error("Your Google session expired. Sign in again.");
  return { email, name: profile.name || email, expiresAt };
}
export async function restoreGoogleSession(): Promise<GoogleSession | null> {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (
      typeof saved.accessToken !== "string" ||
      !saved.accessToken ||
      !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt <= Date.now() + 30000
    ) {
      disconnectGoogle();
      return null;
    }
    // Never trust an identity stored by the browser: revalidate it with Google.
    const verified = await verifyProfile(saved.accessToken, saved.expiresAt);
    // Persist only the short-lived credential, never financial records or a trusted identity.
    // Migrates logins saved by the previous tab-only version after Google verifies them.
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: saved.accessToken,
        expiresAt: saved.expiresAt,
      }),
    );
    sessionStorage.removeItem(SESSION_KEY);
    token = saved.accessToken;
    session = verified;
    return verified;
  } catch (error) {
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
            JSON.stringify({ accessToken: response.access_token, expiresAt }),
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
