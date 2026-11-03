import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, randomUUID } from "node:crypto";
function service() {
  const props = new Map<string, string>();
  let email = "ramasami.official@gmail.com",
    codeEmail = email,
    allowed = true,
    sheet = true,
    tokenStatus = 200,
    unavailable = false,
    noRefresh = false;
  const tokenCalls: any[] = [];
  const c: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) || null,
        setProperty: (k: string, v: string) => props.set(k, v),
        deleteProperty: (k: string) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_a: string, value: string) => [
        ...createHash("sha256").update(value).digest(),
      ],
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({
        setMimeType: () => JSON.parse(text),
      }),
    },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        if (unavailable) throw Error("sensitive upstream message");
        if (url === "https://oauth2.googleapis.com/token") {
          tokenCalls.push({ ...options.payload });
          return {
            getResponseCode: () => tokenStatus,
            getContentText: () =>
              JSON.stringify(
                tokenStatus === 200
                  ? {
                      access_token: "new-access-token",
                      expires_in: 3600,
                      ...(noRefresh
                        ? {}
                        : { refresh_token: "synthetic-refresh-token" }),
                    }
                  : {
                      error: "invalid_grant",
                      error_description: "SECRET-UPSTREAM",
                    },
              ),
          };
        }
        const bearer = options?.headers?.Authorization || "";
        const actor = bearer.includes("new-access-token") ? codeEmail : email;
        const body = url.includes("tokeninfo")
          ? {
              aud: "596898834710-uimpamt17opolc3u06n78i6t9vhq0efj.apps.googleusercontent.com",
              expires_in: 3600,
            }
          : url.includes("userinfo")
            ? { email: actor, email_verified: true }
            : {
                valueRanges: [
                  {
                    values: [
                      ["ID"],
                      [
                        "o",
                        allowed ? "Active" : "Deleted",
                        1,
                        "",
                        "",
                        "",
                        "",
                        JSON.stringify({ kind: "owner", emails: [email] }),
                      ],
                    ],
                  },
                ],
              };
        return {
          getResponseCode: () =>
            url.includes("sheets.googleapis.com") && !sheet ? 403 : 200,
          getContentText: () => JSON.stringify(body),
        };
      },
    },
  };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync("apps-script/Code.gs", "utf8") +
      "\n" +
      fs.readFileSync("apps-script/Auth.gs", "utf8"),
    c,
  );
  const call = (action: string, args: any = {}) =>
    c.doPost({
      postData: {
        contents: JSON.stringify({
          action,
          token: "valid-user-token",
          ...args,
        }),
      },
    });
  const create = () =>
    call("createSession", {
      code: "synthetic-auth-code",
      origin: "https://ramasami.github.io",
    });
  props.set("GOOGLE_OAUTH_CLIENT_SECRET", "synthetic-client-secret");
  return {
    c,
    props,
    call,
    create,
    tokenCalls,
    set: (x: any) => {
      if (x.email !== undefined) email = x.email;
      if (x.codeEmail !== undefined) codeEmail = x.codeEmail;
      if (x.allowed !== undefined) allowed = x.allowed;
      if (x.sheet !== undefined) sheet = x.sheet;
      if (x.tokenStatus !== undefined) tokenStatus = x.tokenStatus;
      if (x.unavailable !== undefined) unavailable = x.unavailable;
      if (x.noRefresh !== undefined) noRefresh = x.noRefresh;
    },
  };
}
test("enrollment keeps refresh tokens server-side, hashes credentials and binds the actor and origin", () => {
  const s = service();
  const result = s.create();
  assert.equal(result.ok, true);
  const d = result.result;
  assert.match(d.deviceToken, /^[a-f0-9]{96}$/);
  assert.equal(d.refreshToken, undefined);
  const key = [...s.props.keys()].find((k) => k.startsWith("AUTH_DEVICE:"))!;
  assert.equal(key.includes(d.deviceToken), false);
  assert.equal(
    JSON.parse(s.props.get(key)!).refreshToken,
    "synthetic-refresh-token",
  );
  assert.equal(s.tokenCalls[0].redirect_uri, "https://ramasami.github.io");
  s.set({ codeEmail: "tnvarsha.99@gmail.com" });
  assert.equal(s.create().ok, false);
  assert.equal(
    s.call("createSession", {
      code: "synthetic-auth-code",
      origin: "https://evil.example",
    }).ok,
    false,
  );
  assert.equal(
    s.call("configureSession", { clientSecret: "safe-synthetic-secret" }).ok,
    true,
  );
  s.set({ email: "tnvarsha.99@gmail.com" });
  assert.equal(
    s.call("configureSession", { clientSecret: "safe-synthetic-secret" }).ok,
    false,
  );
});
test("expired access renews silently but the 30-day deadline never moves", () => {
  const s = service();
  const d = s.create().result;
  const key = [...s.props.keys()].find((k) => k.startsWith("AUTH_DEVICE:"))!;
  const stored = JSON.parse(s.props.get(key)!);
  stored.expiresAt = Date.now() - 1000;
  s.props.set(key, JSON.stringify(stored));
  const restored = s.call("restoreSession", {
    token: undefined,
    deviceToken: d.deviceToken,
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.result.rememberedUntil, d.rememberedUntil);
  assert.equal(s.tokenCalls.at(-1).grant_type, "refresh_token");
  assert.equal(restored.result.refreshToken, undefined);
  assert.equal(restored.result.deviceToken, undefined);
  assert.equal(
    s.call("revokeSession", { token: undefined, deviceToken: d.deviceToken })
      .ok,
    true,
  );
  assert.equal(
    s.call("restoreSession", { token: undefined, deviceToken: d.deviceToken })
      .code,
    "SESSION_EXPIRED",
  );
});
test("expiry and loss of owner or Sheet permission invalidate remembered credentials", () => {
  for (const change of [
    { allowed: false },
    { sheet: false },
    { codeEmail: "tnvarsha.99@gmail.com" },
  ]) {
    const s = service();
    const d = s.create().result;
    s.set(change);
    const r = s.call("restoreSession", { deviceToken: d.deviceToken });
    assert.equal(r.ok, false);
    assert.equal(r.code, "SESSION_EXPIRED");
    assert.equal(
      [...s.props.keys()].filter((k) => k.startsWith("AUTH_DEVICE:")).length,
      0,
    );
  }
  const s = service();
  const d = s.create().result;
  const key = [...s.props.keys()].find((k) => k.startsWith("AUTH_DEVICE:"))!;
  const stored = JSON.parse(s.props.get(key)!);
  stored.until = Date.now() - 1;
  s.props.set(key, JSON.stringify(stored));
  assert.equal(
    s.call("restoreSession", { deviceToken: d.deviceToken }).code,
    "SESSION_EXPIRED",
  );
});
test("temporary outages preserve the remembered credential and revoked grants do not", () => {
  const s = service();
  const d = s.create().result;
  const key = [...s.props.keys()].find((k) => k.startsWith("AUTH_DEVICE:"))!;
  s.set({ unavailable: true });
  assert.equal(
    s.call("restoreSession", { deviceToken: d.deviceToken }).code,
    "SESSION_TEMPORARY",
  );
  assert.equal(s.props.has(key), true);
  s.set({ unavailable: false });
  const stored = JSON.parse(s.props.get(key)!);
  stored.expiresAt = 0;
  s.props.set(key, JSON.stringify(stored));
  s.set({ tokenStatus: 400 });
  const r = s.call("restoreSession", { deviceToken: d.deviceToken });
  assert.equal(r.code, "SESSION_EXPIRED");
  assert.equal(s.props.has(key), false);
  assert.equal(JSON.stringify(r).includes("SECRET-UPSTREAM"), false);
});
test("enrollment rejects missing refresh access, caps devices and rejects unguessable invalid handles", () => {
  const s = service();
  s.set({ noRefresh: true });
  assert.equal(s.create().ok, false);
  s.set({ noRefresh: false });
  for (let i = 0; i < 7; i++) assert.equal(s.create().ok, true);
  assert.equal(
    [...s.props.keys()].filter((k) => k.startsWith("AUTH_DEVICE:")).length,
    5,
  );
  assert.equal(
    s.call("restoreSession", { deviceToken: "bad" }).code,
    "SESSION_EXPIRED",
  );
  assert.equal(
    s.call("restoreSession", { deviceToken: "f".repeat(96) }).code,
    "SESSION_EXPIRED",
  );
  const unauthorized = s.call("createSession", {
    token: "",
    code: "synthetic-auth-code",
    origin: "https://ramasami.github.io",
  });
  assert.equal(unauthorized.ok, false);
});
