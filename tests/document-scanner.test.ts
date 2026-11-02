import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { scanSchema, matchScannedCard } from "../lib/document-scanner";
const proposal = {
  date: "2026-11-02",
  description: "Sample receipt",
  amount: 123.45,
  type: "Expense",
  expenseMode: "Debit",
  kind: "purchase",
  tagId: "food",
  accountHint: null,
  toAccountHint: null,
  creditCardHint: null,
  currency: "INR",
  confidence: "high",
  sourceIndex: 0,
  notes: "",
};
function scanner(
  configured = true,
  status = 200,
  providerError?: { code?: string; type?: string; message?: string },
) {
  const props = new Map<string, string>(
    configured ? [["OPENAI_API_KEY", "server-test-key"]] : [],
  );
  const calls: any[] = [];
  const sandbox: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => props.get(key) || null,
        setProperty: (key: string, value: string) => props.set(key, value),
      }),
    },
    Utilities: {
      base64Decode: (data: string) => Array.from(Buffer.from(data, "base64")),
      formatDate: () => "2026-11-02",
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        calls.push({ url, options });
        return {
          getResponseCode: () => status,
          getAllHeaders: () => ({ "Retry-After": "45" }),
          getContentText: () =>
            providerError
              ? JSON.stringify({ error: providerError })
              : JSON.stringify({
                  status: "completed",
                  output: [
                    {
                      content: [
                        {
                          type: "output_text",
                          text: JSON.stringify({
                            transactions: [proposal],
                            warnings: [],
                          }),
                        },
                      ],
                    },
                  ],
                }),
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), sandbox);
  return { sandbox, calls, props };
}
const request = {
  files: [
    {
      name: "bill.pdf",
      mimeType: "application/pdf",
      data: "data:application/pdf;base64,JVBERi10ZXN0",
    },
  ],
  tags: [{ id: "food", name: "Food", type: "Expense" }],
};
test("AI scanner returns proposals with no Sheet writes and keeps the API key server-side", () => {
  const { sandbox, calls } = scanner();
  const result = sandbox.analyzeDocuments_(request, "authorized-owner");
  assert.equal(result.transactions[0].amount, 123.45);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer server-test-key",
  );
  const body = JSON.parse(calls[0].options.payload);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.ok(!JSON.stringify(result).includes("server-test-key"));
  assert.ok(!JSON.stringify(body).includes("authorized-owner"));
  assert.ok(!body.tools);
});
test("scanner fails clearly without a key, bounds requests and enforces daily limits", () => {
  assert.throws(
    () => scanner(false).sandbox.analyzeDocuments_(request, "owner"),
    /not configured/,
  );
  const { sandbox, props, calls } = scanner();
  assert.throws(
    () => sandbox.analyzeDocuments_({ ...request, files: [] }, "owner"),
    /Select/,
  );
  props.set("scan-count:2026-11-02:owner", "20");
  assert.throws(
    () => sandbox.analyzeDocuments_(request, "owner"),
    /Daily scan/,
  );
  assert.equal(calls.length, 0);
  assert.throws(
    () => scanner(true, 429).sandbox.analyzeDocuments_(request, "owner"),
    /HTTP 429/,
  );
});
test("malformed model output is rejected before it can enter a review", () => {
  assert.equal(
    scanSchema.parse({ transactions: [proposal], warnings: [] }).transactions
      .length,
    1,
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, amount: -1 }],
      warnings: [],
    }),
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, sourceIndex: 99 }],
      warnings: [],
    }),
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, type: "Run code" }],
      warnings: [],
    }),
  );
});

test("scanner key configuration is owner-only, persists securely and never echoes a secret", () => {
  const { sandbox, props } = scanner(false);
  const secret = "sk-proj-synthetic-test-key-for-setup-only";
  assert.throws(
    () =>
      sandbox.configureScanner_({ apiKey: secret }, "tnvarsha.99@gmail.com"),
    /Only the service owner/,
  );
  assert.equal(props.has("OPENAI_API_KEY"), false);
  assert.throws(
    () =>
      sandbox.configureScanner_(
        { apiKey: "bad" },
        "ramasami.official@gmail.com",
      ),
    /valid OpenAI/,
  );
  const response = sandbox.configureScanner_(
    { apiKey: secret },
    "ramasami.official@gmail.com",
  );
  assert.equal(response.configured, true);
  assert.equal(props.get("OPENAI_API_KEY"), secret);
  assert.ok(!JSON.stringify(response).includes(secret));
  assert.throws(
    () =>
      sandbox.configureScanner_({ apiKey: "" }, "ramasami.official@gmail.com"),
    /valid OpenAI/,
  );
  assert.equal(props.get("OPENAI_API_KEY"), secret);
});

test("OpenAI 429 errors distinguish billing/quota from transient rate limits without exposing raw messages", () => {
  for (const [code, type, expected] of [
    ["credit_balance_exhausted", "insufficient_quota", /credits are exhausted/],
    [
      "project_spend_limit_exceeded",
      "insufficient_quota",
      /project spending limit/,
    ],
    [
      "organization_spend_limit_exceeded",
      "insufficient_quota",
      /organization spending limit/,
    ],
    [
      "organization_usage_limit_exceeded",
      "insufficient_quota",
      /organization usage limit/,
    ],
    ["insufficient_quota", "insufficient_quota", /Waiting alone will not fix/],
    ["rate_limit_exceeded", "rate_limit_error", /at least 45 seconds/],
    ["slow_down", "rate_limit_error", /temporarily rate-limited/],
    ["unknown", "unknown", /did not identify which limit/],
  ] as const) {
    const { sandbox, calls } = scanner(true, 429, {
      code,
      type,
      message: "private document server-test-key",
    });
    assert.throws(
      () => sandbox.analyzeDocuments_(request, "owner"),
      (error: any) => {
        assert.match(error.message, expected);
        assert.ok(!error.message.includes("private document"));
        assert.ok(!error.message.includes("server-test-key"));
        return true;
      },
    );
    assert.equal(calls.length, 1);
  }
});

test("scans validate inferred document details and only auto-match an unambiguous card", () => {
  const docs = [
    {
      sourceIndex: 0,
      statementKind: "CreditCard",
      dateFormat: "DMY",
      creditCardHint: "HDFC Millennia",
    },
  ];
  assert.equal(
    scanSchema.parse({
      documents: docs,
      transactions: [proposal],
      warnings: [],
    }).documents[0].dateFormat,
    "DMY",
  );
  assert.throws(() =>
    scanSchema.parse({
      documents: [{ ...docs[0], dateFormat: "GUESS" }],
      transactions: [],
      warnings: [],
    }),
  );
  assert.equal(
    matchScannedCard("HDFC Millennia", [{ id: "c1", name: "HDFC Millennia" }]),
    "c1",
  );
  assert.equal(
    matchScannedCard("HDFC", [
      { id: "c1", name: "HDFC Millennia" },
      { id: "c2", name: "HDFC Regalia" },
    ]),
    "",
  );
  const { sandbox, calls } = scanner();
  sandbox.analyzeDocuments_(
    { ...request, hints: { statementKind: "CreditCard", dateFormat: "MDY" } },
    "owner",
  );
  const sent = JSON.parse(calls[0].options.payload);
  assert.ok(sent.text.format.schema.required.includes("documents"));
  assert.match(sent.instructions, /"statementKind":"CreditCard"/);
  assert.match(sent.instructions, /"dateFormat":"MDY"/);
  assert.match(sent.instructions, /rather than guessing/);
});

test("saved-key tests use a tiny fixed request without exposing keys or changing finance data", () => {
  const { sandbox, calls, props } = scanner();
  const result = sandbox.testScannerKey_("owner");
  assert.equal(result.ok, true);
  assert.equal(result.model, "gpt-4.1-mini");
  assert.ok(!JSON.stringify(result).includes("server-test-key"));
  const sent = JSON.parse(calls[0].options.payload);
  assert.deepEqual(sent, {
    model: "gpt-4.1-mini",
    store: false,
    max_output_tokens: 16,
    input: "Reply with OK.",
  });
  assert.equal(props.get("OPENAI_API_KEY"), "server-test-key");
  assert.throws(() => sandbox.testScannerKey_("owner"), /Wait .* seconds/);
  assert.equal(calls.length, 1);
  assert.equal(props.has("scan-count:2026-11-02:owner"), false);
});

test("saved-key tests reject missing keys and report billing failures safely", () => {
  const missing = scanner(false);
  assert.throws(
    () => missing.sandbox.testScannerKey_("owner"),
    /No saved OpenAI API key/,
  );
  assert.equal(missing.calls.length, 0);
  const { sandbox, calls } = scanner(true, 429, {
    code: "insufficient_quota",
    message: "server-test-key private provider detail",
  });
  assert.throws(
    () => sandbox.testScannerKey_("owner"),
    (error: any) => {
      assert.match(error.message, /quota or billing allowance/);
      assert.ok(!error.message.includes("server-test-key"));
      assert.ok(!error.message.includes("private provider"));
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("provider selection is owner-only, allowlisted and preserves both saved keys", () => {
  const { sandbox, props } = scanner();
  const owner = "ramasami.official@gmail.com";
  assert.equal(sandbox.scannerStatus_(owner).provider, "openai");
  assert.throws(
    () =>
      sandbox.selectScannerProvider_(
        { provider: "gemini" },
        "tnvarsha.99@gmail.com",
      ),
    /Only the service owner/,
  );
  for (const provider of ["custom", "__proto__", "https://attacker.invalid"])
    assert.throws(
      () => sandbox.selectScannerProvider_({ provider }, owner),
      /Unsupported/,
    );
  assert.throws(
    () => sandbox.selectScannerProvider_({ provider: "gemini" }, owner),
    /Save this provider/,
  );
  assert.equal(props.get("AI_PROVIDER"), undefined);
  const secret = "AIza-synthetic-gemini-key-for-test-only";
  assert.throws(
    () =>
      sandbox.configureScanner_(
        { provider: "gemini", apiKey: secret },
        "other@example.com",
      ),
    /Only the service owner/,
  );
  const saved = sandbox.configureScanner_(
    { provider: "gemini", apiKey: secret },
    owner,
  );
  assert.equal(saved.provider, "openai");
  assert.equal(
    saved.providers.find((item: any) => item.provider === "gemini").configured,
    true,
  );
  assert.equal(saved.configured, true);
  assert.ok(!JSON.stringify(saved).includes(secret));
  assert.equal(props.get("OPENAI_API_KEY"), "server-test-key");
  assert.equal(
    sandbox.selectScannerProvider_({ provider: "openai" }, owner).configured,
    true,
  );
  assert.equal(
    sandbox.selectScannerProvider_({ provider: "gemini" }, owner).configured,
    true,
  );
  assert.equal(props.get("GEMINI_API_KEY"), secret);
});
function gemini(
  status = 200,
  body: any = {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                documents: [],
                transactions: [proposal],
                warnings: [],
              }),
            },
          ],
        },
      },
    ],
  },
) {
  const context = scanner();
  context.props.set("AI_PROVIDER", "gemini");
  context.props.set("GEMINI_API_KEY", "synthetic-gemini-key");
  context.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
    context.calls.push({ url, options });
    return {
      getResponseCode: () => status,
      getContentText: () => JSON.stringify(body),
    };
  };
  return context;
}
test("Gemini analyzes PDFs/images with an explicit schema and no credentials or finance writes in output", () => {
  const { sandbox, calls } = gemini();
  const result = sandbox.analyzeDocuments_(
    {
      ...request,
      provider: "gemini",
      files: [
        ...request.files,
        {
          name: "bill.png",
          mimeType: "image/png",
          data: "data:image/png;base64,dGVzdA==",
        },
      ],
    },
    "owner",
  );
  assert.equal(result.transactions[0].amount, 123.45);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  );
  assert.equal(
    calls[0].options.headers["x-goog-api-key"],
    "synthetic-gemini-key",
  );
  const sent = JSON.parse(calls[0].options.payload);
  assert.equal(
    sent.contents[0].parts[0].inlineData.mimeType,
    "application/pdf",
  );
  assert.equal(sent.contents[0].parts[1].inlineData.mimeType, "image/png");
  assert.equal(
    sent.generationConfig.responseFormat.text.mimeType,
    "APPLICATION_JSON",
  );
  assert.ok(
    sent.generationConfig.responseFormat.text.schema.required.includes(
      "documents",
    ),
  );
  assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.ok(!sent.tools);
  assert.ok(!JSON.stringify(sent).includes("synthetic-gemini-key"));
  assert.ok(!JSON.stringify(result).includes("synthetic-gemini-key"));
});
test("stale provider requests fail before any document is forwarded", () => {
  const { sandbox, calls } = gemini();
  assert.throws(
    () =>
      sandbox.analyzeDocuments_({ ...request, provider: "openai" }, "owner"),
    /provider changed/,
  );
  assert.throws(
    () => sandbox.testScannerKey_("owner", "openai"),
    /provider changed/,
  );
  assert.equal(calls.length, 0);
});
test("Gemini tests use only a fixed prompt; errors and blocked/incomplete output fail without fallback", () => {
  const { sandbox, calls } = gemini();
  assert.equal(sandbox.testScannerKey_("owner", "gemini").ok, true);
  const sent = JSON.parse(calls[0].options.payload);
  assert.deepEqual(sent.contents[0].parts, [{ text: "Reply with OK." }]);
  assert.equal(sent.generationConfig.responseFormat, undefined);
  assert.equal(sent.generationConfig.thinkingConfig, undefined);
  assert.equal(sent.systemInstruction, undefined);
  assert.equal(sent.generationConfig.maxOutputTokens, 1024);
  assert.throws(() => sandbox.testScannerKey_("owner", "gemini"), /Wait/);
  for (const status of [400, 401, 403, 404, 429, 500]) {
    const failed = gemini(status, {
      error: { message: "private-provider-key-and-document" },
    });
    assert.throws(
      () =>
        failed.sandbox.analyzeDocuments_(
          { ...request, provider: "gemini" },
          "owner",
        ),
      (e: any) => {
        assert.match(e.message, new RegExp("HTTP " + status));
        assert.ok(!e.message.includes("private-provider"));
        return true;
      },
    );
    assert.equal(failed.calls.length, 1);
  }
  for (const body of [
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "MAX_TOKENS" }] },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "invalid" }] } },
      ],
    },
  ]) {
    const failed = gemini(200, body);
    assert.throws(() => failed.sandbox.analyzeDocuments_(request, "owner"));
    assert.equal(failed.calls.length, 1);
  }
});

test("Groq uses the saved vision key and rejects PDFs or oversized image batches before forwarding", () => {
  const context = scanner();
  context.props.set("AI_PROVIDER", "groq");
  context.props.set("GROQ_API_KEY", "synthetic-groq-key");
  context.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
    context.calls.push({ url, options });
    return {
      getResponseCode: () => 200,
      getContentText: () =>
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  documents: [],
                  transactions: [proposal],
                  warnings: [],
                }),
              },
            },
          ],
        }),
    };
  };
  assert.throws(
    () => context.sandbox.analyzeDocuments_(request, "owner"),
    /up to 3 images/,
  );
  const image = {
    name: "bill.png",
    mimeType: "image/png",
    data: "data:image/png;base64,dGVzdA==",
  };
  assert.throws(
    () =>
      context.sandbox.analyzeDocuments_(
        { ...request, files: [image, image, image, image] },
        "owner",
      ),
    /up to 3 images/,
  );
  assert.equal(context.calls.length, 0);
  const result = context.sandbox.analyzeDocuments_(
    { ...request, provider: "groq", files: [image] },
    "owner",
  );
  assert.equal(result.transactions[0].amount, 123.45);
  const call = context.calls[0],
    sent = JSON.parse(call.options.payload);
  assert.equal(call.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(call.options.headers.Authorization, "Bearer synthetic-groq-key");
  assert.equal(sent.model, "qwen/qwen3.8-27b");
  assert.equal(sent.messages[0].content[1].image_url.url, image.data);
  assert.equal(sent.response_format.type, "json_object");
  assert.ok(!sent.tools);
  assert.ok(!JSON.stringify(result).includes("synthetic-groq-key"));
  assert.equal(context.sandbox.testScannerKey_("owner", "groq").ok, true);
  const testBody = JSON.parse(context.calls[1].options.payload);
  assert.deepEqual(testBody.messages, [
    { role: "user", content: [{ type: "text", text: "Reply with OK." }] },
  ]);
  assert.equal(testBody.response_format, undefined);
  for (const status of [400, 401, 403, 404, 429, 500]) {
    const error = context.sandbox.scannerProviderError_(
      {
        getResponseCode: () => status,
        getContentText: () => '{"error":{"message":"secret"}}',
      },
      "groq",
    );
    assert.match(error, new RegExp("HTTP " + status));
    assert.ok(!error.includes("secret"));
  }
});

test("Claude reads inline images and PDFs with structured proposals and fails safely on refusals", () => {
  const context = scanner();
  context.props.set("AI_PROVIDER", "claude");
  context.props.set("ANTHROPIC_API_KEY", "synthetic-claude-key");
  let body: any = {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          documents: [],
          transactions: [proposal],
          warnings: [],
        }),
      },
    ],
  };
  context.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
    context.calls.push({ url, options });
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify(body),
    };
  };
  const image = {
    name: "bill.png",
    mimeType: "image/png",
    data: "data:image/png;base64,dGVzdA==",
  };
  const result = context.sandbox.analyzeDocuments_(
    { ...request, provider: "claude", files: [...request.files, image] },
    "owner",
  );
  assert.equal(result.transactions[0].amount, 123.45);
  const call = context.calls[0],
    sent = JSON.parse(call.options.payload);
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.options.headers["x-api-key"], "synthetic-claude-key");
  assert.equal(call.options.headers["anthropic-version"], "2026-10-21");
  assert.equal(sent.model, "claude-sonnet-5-5");
  assert.equal(sent.messages[0].content[1].type, "document");
  assert.equal(
    sent.messages[0].content[1].source.media_type,
    "application/pdf",
  );
  assert.equal(sent.messages[0].content[2].type, "image");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.ok(sent.output_config.format.schema.required.includes("documents"));
  assert.ok(!sent.tools);
  assert.ok(!JSON.stringify(result).includes("synthetic-claude-key"));
  assert.equal(context.sandbox.testScannerKey_("owner", "claude").ok, true);
  const test = JSON.parse(context.calls[1].options.payload);
  assert.deepEqual(test.messages, [
    { role: "user", content: [{ type: "text", text: "Reply with OK." }] },
  ]);
  assert.equal(test.output_config, undefined);
  for (const invalid of [
    { stop_reason: "max_tokens", content: [] },
    { stop_reason: "refusal", content: [] },
    {
      stop_reason: "end_turn",
      stop_details: { type: "refusal" },
      content: [{ type: "text", text: "{}" }],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "invalid" }] },
  ]) {
    body = invalid;
    const count = context.calls.length;
    assert.throws(() =>
      context.sandbox.analyzeDocuments_(
        { ...request, provider: "claude" },
        "owner",
      ),
    );
    assert.equal(context.calls.length, count + 1);
  }
  for (const status of [400, 401, 402, 403, 404, 429, 500, 529]) {
    const error = context.sandbox.scannerProviderError_(
      {
        getResponseCode: () => status,
        getContentText: () => '{"error":{"message":"secret"}}',
      },
      "claude",
    );
    assert.match(error, new RegExp("HTTP " + status));
    assert.ok(!error.includes("secret"));
  }
});

test("Groq and Claude keys can be saved independently without changing the active provider", () => {
  const context = scanner();
  const owner = "ramasami.official@gmail.com";
  for (const [provider, property] of [
    ["groq", "GROQ_API_KEY"],
    ["claude", "ANTHROPIC_API_KEY"],
  ]) {
    context.sandbox.configureScanner_(
      { provider, apiKey: "synthetic-private-provider-key" },
      owner,
    );
    assert.equal(context.sandbox.scannerStatus_(owner).provider, "openai");
    assert.equal(context.props.get(property), "synthetic-private-provider-key");
    assert.equal(context.props.get("OPENAI_API_KEY"), "server-test-key");
    assert.throws(
      () =>
        context.sandbox.configureScanner_(
          { provider, apiKey: "bad\r\nheader" },
          owner,
        ),
      /valid/,
    );
    assert.equal(context.props.get(property), "synthetic-private-provider-key");
  }
});

test("all saved key statuses survive selection and keys with punctuation or surrounding whitespace save without browser format restrictions", () => {
  const { sandbox, props } = scanner(false),
    owner = "ramasami.official@gmail.com";
  assert.equal(sandbox.scannerStatus_(owner).providers.length, 4);
  assert.throws(
    () => sandbox.selectScannerProvider_({ provider: "gemini" }, owner),
    /Save this provider/,
  );
  for (const [provider, property, key] of [
    ["openai", "OPENAI_API_KEY", "sk-synthetic-openai-key-long-enough"],
    ["gemini", "GEMINI_API_KEY", "AQ.synthetic.gemini-key-with.punctuation"],
    ["groq", "GROQ_API_KEY", "gsk_synthetic-groq-key-long-enough"],
    ["claude", "ANTHROPIC_API_KEY", "sk-ant-synthetic-claude-key-long-enough"],
  ]) {
    const response = sandbox.configureScanner_(
      { provider, apiKey: "  " + key + "  " },
      owner,
    );
    assert.equal(props.get(property), key);
    assert.equal(response.provider, "openai");
    assert.ok(!JSON.stringify(response).includes(key));
  }
  for (const item of sandbox.scannerStatus_(owner).providers) {
    assert.equal(item.configured, true);
    assert.equal(
      sandbox.selectScannerProvider_({ provider: item.provider }, owner)
        .provider,
      item.provider,
    );
  }
  const before = props.get("GEMINI_API_KEY");
  for (const key of [
    "bad",
    "valid-length-key but has space",
    "valid-length-key\r\nheader-injection",
    "x".repeat(2049),
  ])
    assert.throws(
      () =>
        sandbox.configureScanner_({ provider: "gemini", apiKey: key }, owner),
      /valid/,
    );
  assert.equal(props.get("GEMINI_API_KEY"), before);
  assert.throws(
    () =>
      sandbox.configureScanner_(
        { provider: "__proto__", apiKey: "synthetic-provider-key" },
        owner,
      ),
    /Unsupported/,
  );
});

test("Gemini key test retries only explicit 503s with bounded backoff and identical minimal requests", () => {
  const context = gemini();
  const sleeps: number[] = [];
  context.sandbox.Utilities.sleep = (ms: number) => sleeps.push(ms);
  context.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
    context.calls.push({ url, options });
    return {
      getResponseCode: () => (context.calls.length < 3 ? 503 : 200),
      getAllHeaders: () => ({}),
      getContentText: () =>
        JSON.stringify({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "OK" }] } },
          ],
        }),
    };
  };
  assert.equal(context.sandbox.testScannerKey_("owner", "gemini").ok, true);
  assert.equal(context.calls.length, 3);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[0] >= 1000 && sleeps[0] < 1250);
  assert.ok(sleeps[1] >= 2000 && sleeps[1] < 2250);
  for (const call of context.calls) {
    assert.equal(call.url, context.calls[0].url);
    assert.equal(call.options.payload, context.calls[0].options.payload);
    assert.deepEqual(JSON.parse(call.options.payload), {
      contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
      generationConfig: { maxOutputTokens: 1024 },
    });
  }
  assert.equal(context.props.get("GEMINI_API_KEY"), "synthetic-gemini-key");
  assert.equal(context.props.has("scan-count:2026-11-02:owner"), false);
  assert.throws(
    () => context.sandbox.testScannerKey_("owner", "gemini"),
    /Wait/,
  );
  assert.equal(context.calls.length, 3);
});

test("persistent Gemini 503s stop after three key-test attempts but document analysis is never retried", () => {
  for (const scan of [false, true]) {
    const context = gemini(503, {
      error: { message: "private document synthetic-gemini-key" },
    });
    const sleeps: number[] = [];
    context.sandbox.Utilities.sleep = (ms: number) => sleeps.push(ms);
    assert.throws(
      () =>
        scan
          ? context.sandbox.analyzeDocuments_(request, "owner")
          : context.sandbox.testScannerKey_("owner", "gemini"),
      (e: any) => {
        assert.match(e.message, /HTTP 503/);
        assert.match(e.message, /does not identify the exact cause/);
        assert.match(e.message, /key is still saved/);
        assert.ok(!e.message.includes("private document"));
        assert.ok(!e.message.includes("synthetic-gemini-key"));
        return true;
      },
    );
    assert.equal(context.calls.length, scan ? 1 : 3);
    assert.equal(sleeps.length, scan ? 0 : 2);
  }
});

test("Gemini test respects Retry-After and never retries transport/auth/quota errors", () => {
  for (const seconds of [3, 60]) {
    const context = gemini(503);
    const sleeps: number[] = [];
    context.sandbox.Utilities.sleep = (ms: number) => sleeps.push(ms);
    context.sandbox.UrlFetchApp.fetch = (_url: string, _options: any) => {
      context.calls.push({});
      return {
        getResponseCode: () => 503,
        getAllHeaders: () => ({ "Retry-After": String(seconds) }),
        getContentText: () => "{}",
      };
    };
    assert.throws(
      () => context.sandbox.testScannerKey_("owner", "gemini"),
      new RegExp("at least " + seconds + " seconds"),
    );
    assert.equal(context.calls.length, seconds === 3 ? 3 : 1);
    assert.ok(sleeps.every((ms) => ms >= seconds * 1000 && ms <= 5000));
  }
  for (const code of [400, 401, 403, 404, 429, 500]) {
    const context = gemini(code);
    context.sandbox.Utilities.sleep = () => assert.fail("No delay expected");
    assert.throws(() => context.sandbox.testScannerKey_("owner", "gemini"));
    assert.equal(context.calls.length, 1);
  }
  const context = gemini();
  let attempts = 0;
  context.sandbox.UrlFetchApp.fetch = () => {
    attempts++;
    throw Error("private transport details");
  };
  assert.throws(
    () => context.sandbox.testScannerKey_("owner", "gemini"),
    /Could not reach Gemini/,
  );
  assert.equal(attempts, 1);
});
