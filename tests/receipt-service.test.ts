import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function service(
  email = "ramasami.official@gmail.com",
  aud = "596898834710-uimpamt17opolc3u06n78i6t9vhq0efj.apps.googleusercontent.com",
  ownerConfig?: { email: string; active?: boolean; sheetAccess?: boolean },
) {
  const files: any = {
    "shared-receipt": {
      id: "shared-receipt",
      parents: ["folder"],
      appProperties: { budgetService: "v1" },
      mimeType: "image/png",
      size: 3,
      trashed: false,
    },
  };
  const changes: any[] = [];
  const calls: string[] = [];
  const context: any = {
    console,
    Session: { getEffectiveUser: () => ({ getEmail: () => email }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "folder" }),
    },
    ScriptApp: { getOAuthToken: () => "owner-token" },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({
        setMimeType: () => JSON.parse(text),
      }),
    },
    Utilities: { base64Encode: () => "YWJj" },
    UrlFetchApp: {
      fetch: (url: string, options: any = {}) => {
        calls.push(url);
        let data: any;
        if (url.includes("tokeninfo")) data = { aud, expires_in: 3600 };
        else if (url.includes("userinfo"))
          data = { email, email_verified: true };
        else if (url.includes("sheets.googleapis.com")) {
          assert.equal(
            options.headers.Authorization,
            "Bearer valid-user-token",
          );
          if (ownerConfig?.sheetAccess === false)
            return { getResponseCode: () => 403, getContentText: () => "{}" };
          data = {
            valueRanges: [
              {
                values: ownerConfig
                  ? [
                      ["ID"],
                      [
                        "owner-x",
                        ownerConfig.active === false ? "Deleted" : "Active",
                        1,
                        "",
                        "",
                        "",
                        "",
                        JSON.stringify({
                          kind: "owner",
                          emails: [ownerConfig.email],
                        }),
                      ],
                    ]
                  : [],
              },
            ],
          };
        } else {
          const id = url.match(/files\/([\w-]+)/)?.[1];
          const file = files[id || ""];
          if (!file) throw Error("No file");
          if (options.method === "patch") {
            Object.assign(file, JSON.parse(options.payload));
            changes.push({ id, trashed: file.trashed });
          }
          data = file;
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify(data),
          getContent: () => [97, 98, 99],
        };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), context);
  return {
    files,
    changes,
    calls,
    run: (action: string, id = "shared-receipt") =>
      context.doPost({
        postData: {
          contents: JSON.stringify({ action, id, token: "valid-user-token" }),
        },
      }),
  };
}
for (const email of ["ramasami.official@gmail.com", "tnvarsha.99@gmail.com"])
  test(`${email} can trash and restore the same centrally owned receipt`, () => {
    const s = service(email);
    assert.equal(s.run("trash").ok, true);
    assert.equal(s.files["shared-receipt"].trashed, true);
    assert.equal(s.run("restore").ok, true);
    assert.equal(s.files["shared-receipt"].trashed, false);
    assert.equal(s.changes.length, 2);
  });
test("service rejects other accounts and tokens from another OAuth application before file access", () => {
  for (const s of [
    service("outsider@gmail.com"),
    service("ramasami.official@gmail.com", "another-client"),
  ]) {
    assert.equal(s.run("trash").ok, false);
    assert.equal(s.changes.length, 0);
    assert.equal(
      s.calls.some((x) => x.includes("/drive/")),
      false,
    );
  }
});
test("service rejects unrelated files even for an approved account", () => {
  const s = service();
  s.files["shared-receipt"].parents = ["unrelated-folder"];
  assert.equal(s.run("trash").ok, false);
  assert.equal(s.changes.length, 0);
  s.files["shared-receipt"].parents = ["folder"];
  s.files["shared-receipt"].appProperties = {};
  assert.equal(s.run("trash").ok, false);
  assert.equal(s.changes.length, 0);
});
test("service rejects malformed/anonymous requests and exposes no owner token", () => {
  const s = service();
  assert.equal(s.run("delete-permanently").ok, false);
  assert.equal(s.changes.length, 0);
  assert.equal(JSON.stringify(s.run("info")).includes("owner-token"), false);
});

test("new receipt users require both active owner membership and access to the actual Sheet", () => {
  const allowed = service("new@example.com", undefined, {
    email: "new@example.com",
  });
  assert.equal(allowed.run("trash").ok, true);
  for (const config of [
    { email: "new@example.com", sheetAccess: false },
    { email: "new@example.com", active: false },
    { email: "other@example.com" },
  ]) {
    const denied = service("new@example.com", undefined, config);
    assert.equal(denied.run("trash").ok, false);
    assert.equal(denied.changes.length, 0);
  }
});
