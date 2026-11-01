import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signInGoogle,
  currentGoogleSession,
  googleToken,
  disconnectGoogle,
  restoreGoogleSession,
  SESSION_KEY,
} from "../lib/google-auth";

test("Google sign-in accepts only the two verified approved accounts and clears rejected sessions", async () => {
  const originalFetch = globalThis.fetch;
  const authStorage = new Map<string, string>();
  const legacyStorage = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => legacyStorage.get(key) || null,
    setItem: (key: string, value: string) => legacyStorage.set(key, value),
    removeItem: (key: string) => legacyStorage.delete(key),
  };
  let profile: { email: string; email_verified: boolean };
  let requests = 0;
  (globalThis as any).window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => ({
            requestAccessToken: () =>
              config.callback({
                access_token: "test-token",
                expires_in: 3600,
                scope: "https://www.googleapis.com/auth/spreadsheets",
              }),
          }),
        },
      },
    },
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) =>
      key === "wealthtrack-google-client-id"
        ? "123-test.apps.googleusercontent.com"
        : authStorage.get(key) || null,
    setItem: (key: string, value: string) => authStorage.set(key, value),
    removeItem: (key: string) => authStorage.delete(key),
  };
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      "https://www.googleapis.com/oauth2/v3/userinfo",
    );
    requests++;
    return new Response(JSON.stringify(profile), { status: 200 });
  };
  try {
    for (const email of [
      "ramasami.official@gmail.com",
      "tnvarsha.99@gmail.com",
    ]) {
      profile = { email, email_verified: true };
      assert.equal((await signInGoogle()).email, email);
      assert.equal(googleToken(), "test-token");
    }
    profile = { email: " RAMASAMI.OFFICIAL@gmail.com ", email_verified: true };
    assert.equal((await signInGoogle()).email, "ramasami.official@gmail.com");
    for (const rejected of [
      { email: "someone@example.com", email_verified: true },
      {
        email: "ramasami.official@gmail.com.evil.example",
        email_verified: true,
      },
      { email: "tnvarsha.99@gmail.com", email_verified: false },
      { email: "", email_verified: true },
    ]) {
      profile = rejected;
      await assert.rejects(signInGoogle(), /not authorized/);
      assert.equal(currentGoogleSession(), null);
      assert.throws(googleToken, /Sign in to Google/);
    }
    assert.equal(requests, 7);
    authStorage.set(
      SESSION_KEY,
      JSON.stringify({
        accessToken: "test-token",
        expiresAt: Date.now() + 3600000,
      }),
    );
    profile = { email: "tnvarsha.99@gmail.com", email_verified: true };
    assert.equal(
      (await restoreGoogleSession())?.email,
      "tnvarsha.99@gmail.com",
    );
    assert.equal(requests, 8);
    disconnectGoogle();
    authStorage.set(
      SESSION_KEY,
      JSON.stringify({ accessToken: "expired", expiresAt: Date.now() - 1 }),
    );
    assert.equal(await restoreGoogleSession(), null);
    assert.equal(requests, 8);
    assert.equal(authStorage.has(SESSION_KEY), false);
    authStorage.set(
      SESSION_KEY,
      JSON.stringify({
        accessToken: "test-token",
        expiresAt: Date.now() + 3600000,
        email: "tnvarsha.99@gmail.com",
      }),
    );
    profile = { email: "outsider@example.com", email_verified: true };
    await assert.rejects(restoreGoogleSession(), /not authorized/);
    assert.equal(currentGoogleSession(), null);
    assert.equal(authStorage.has(SESSION_KEY), false);
    profile = { email: "tnvarsha.99@gmail.com", email_verified: true };
    legacyStorage.set(
      SESSION_KEY,
      JSON.stringify({
        accessToken: "test-token",
        expiresAt: Date.now() + 3600000,
      }),
    );
    assert.equal(
      (await restoreGoogleSession())?.email,
      "tnvarsha.99@gmail.com",
    );
    assert.equal(legacyStorage.has(SESSION_KEY), false);
    assert.equal(authStorage.has(SESSION_KEY), true);
    disconnectGoogle();
    assert.equal(authStorage.has(SESSION_KEY), false);
  } finally {
    disconnectGoogle();
    globalThis.fetch = originalFetch;
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
  }
});
