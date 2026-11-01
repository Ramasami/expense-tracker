const SCOPE =
  "https://www.googleapis.com/auth/spreadsheets openid email profile";
const ALLOWED_EMAILS = new Set([
  "ramasami.official@gmail.com",
  "tnvarsha.99@gmail.com",
]);
export type GoogleSession = { email: string; name: string; expiresAt: number };
let token = "",
  session: GoogleSession | null = null,
  loading: Promise<void> | null = null;
export const CLIENT_KEY = "wealthtrack-google-client-id";
export function currentGoogleSession() {
  if (session && session.expiresAt > Date.now() + 30000) return session;
  token = "";
  session = null;
  return null;
}
export function googleToken() {
  if (!currentGoogleSession())
    throw Error("Sign in to Google to save to your sheet.");
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
    throw Error(
      "Set your Google Web OAuth client ID in Settings before signing in.",
    );
  if (!(window as any).google?.accounts?.oauth2)
    throw Error("Google sign-in is still loading. Try again in a moment.");
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      include_granted_scopes: true,
      callback: async (response: any) => {
        if (response.error) {
          reject(Error(response.error_description || response.error));
          return;
        }
        try {
          const granted = new Set(String(response.scope || "").split(" "));
          if (!granted.has("https://www.googleapis.com/auth/spreadsheets"))
            throw Error("Grant Google Sheets access to save records.");
          const user = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            { headers: { Authorization: "Bearer " + response.access_token } },
          );
          if (!user.ok) throw Error("Could not verify the Google account.");
          const profile = await user.json();
          const email = String(profile.email || "")
            .trim()
            .toLowerCase();
          if (profile.email_verified !== true || !ALLOWED_EMAILS.has(email))
            throw Error(
              "This Google account is not authorized. Sign in with Ram's or Varsha's approved account.",
            );
          token = response.access_token;
          session = {
            email,
            name: profile.name || email,
            expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
          };
          resolve(session);
        } catch (e) {
          token = "";
          session = null;
          reject(e);
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
}
