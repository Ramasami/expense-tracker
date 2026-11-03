# Budget Tracker architecture

## Runtime and deployment

The website is a static Next.js export hosted on GitHub Pages. Client components implement navigation and local UI state. Direct authenticated Google Sheets requests read and write finance data. The existing Google Apps Script service handles shared receipt ownership and optional OpenAI/Gemini/Groq document analysis. It is not a general financial-write backend.

`app/page.tsx` coordinates screens, session/owner/account scope, lazy collection loading, dialogs, write confirmation, cache state and cross-tab refresh. Smaller screen components live under `app/`. Finance rules and Google integrations live under `lib/`. Read the generated context for the current file/export inventory.

## Identity and authorization

Google OAuth identifies the signed-in email. Active owner/email mappings are stored in App Settings, and that Google account must also have access to the private Sheet. New owners do not gain Sheet access merely by being added to the app. Accounts and owners have a many-to-many relationship; login defaults to the mapped owner. All aggregates the selected household/account scope.

Saved Google sessions have an expiry. Reopening can reuse an unexpired verified session. A valid offline session can display its account-scoped cache with a clear stale/offline warning, but edits are disabled. Revoked permissions cannot be revalidated without a connection. Never extend a token's lifetime locally.

## Financial source of truth

Google Sheets is authoritative. The browser cache contains only previously confirmed snapshots, collection timestamps and session/preferences. It must never become a competing writable ledger. A failed refresh may leave clearly marked cached data visible read-only; a failed save must preserve a usable form and must not pretend a local change succeeded.

`lib/local-store.ts` is used to validate and plan an operation against an in-memory snapshot. `lib/google-sheets.ts` sends the resulting changes and audit receipt, then reads the Sheet back. It does not use the old browser-only finance store. `lib/sheet-cache.ts` is the separate read-only offline cache.

Each mutation has an operation ID and exact request signature. Retries with the same fields recover the audit receipt; changing fields under an existing operation is rejected. Versions and source fingerprints catch stale edits. The browser cannot provide a distributed transaction lock against manual edits or other devices; preserve all rechecks rather than claiming a stronger guarantee.

## Sheet structure and deletion

Expense Ledger stores transactions. Expense Tags provides valid managed categories. Accounts stores bank/card and owner associations. App Settings includes owner mappings, preferences, loan configurations and reconciliations. Other supporting tabs include budgets, goals, recurring transactions and legacy holdings. Audit Log records mutations. Ledger W contains receipt metadata and X contains card/loan/import details.

D and I contain array formulas: never overwrite them or shift rows while deleting a transaction. Normal delete changes status and can be restored. Permanent deletion is allowed only for an already-deleted transaction, after linked receipt cleanup and reference/concurrency checks. It clears the row's data cells in place, preserves formula columns, verifies absence and records a minimal purge receipt. Existing audit history remains; this is not erasure from audits, independent backups or Drive Trash.

## Financial rules

- Current bank balances derive from configured opening amounts and confirmed ledger movements; reported historical confirmations must not freeze them.
- Debit expenses affect cash immediately. Credit card purchases are deferred; settlement payments consume cash without counting the purchase twice.
- Card configurations live in Accounts. Billing cycles, due dates, refunds, partial allocation and unknown imported payment status use shared credit helpers.
- Transfers need different source/destination accounts. The source account owns the ledger entry.
- Loan repayments split principal and interest; principal reduces the balance. Forecast scenarios never create payments or alter real balances.
- Monthly budgets can contain multiple tags and count a matching transaction once per budget. Overlapping budgets can each include the same transaction.
- Financial goals are flexible savings, investment, purchase or debt milestones; they are not restricted to net worth.
- Reconciliation compares the ledger with an entered statement balance; it must not invent a balancing expense automatically.

## Documents and receipts

CSV upload has a downloadable example and an editable column/transaction preview. AI upload accepts images and PDFs in the same flow, with an optional credit card checkbox and configured-card selection or automatic matching. Source kind and DMY/MDY/YMD format can be inferred from visible evidence. Unknown/ambiguous data stays flagged; running balances, limits, due totals and subtotals are not transactions. Matching a card requires a unique configured name in the selected account. Card/loan payments requiring allocations use their dedicated flows.

AI analysis sends selected documents and sanitized active tags through the authenticated Apps Script service to the selected provider (adapter details below). OpenAI Responses uses a strict output schema and `store:false`. It returns proposals only. Review confirmation is required before the ordinary audited save path writes selected entries. On confirmed AI imports, each row’s source image/PDF is uploaded through the shared receipt service and included in the same audited transaction create. Nothing uploads to Drive during analysis/review. Each transaction receives its own file, even for rows from one statement, so deleting one attachment cannot break another. Raw provider error messages and credentials are never exposed; quota/billing errors are distinguished from temporary rate limits.

Only the service owner can save/replace each shared provider key through the Settings text field. The field is cleared after submission; the key is stored only in Script properties, never returned or placed in Sheet/cache/backups. Settings stays expanded and shows configured status. For OpenAI, restricted keys need Responses Write; document inputs are inline and do not require Files permission. Saving confirms storage, not billing or model availability. Settings also offers Test saved API key: an explicit request to the selected provider using its configured model. OpenAI uses 16 output tokens with store:false; Gemini/Groq cap tests at 1,024 including reasoning. Billing/free quota applies. It sends no financial data or documents, returns no raw model text or key, reuses sanitized provider errors and is limited to one test per minute per authorized owner. Successful tests establish provider/model access, not document extraction quality.

Receipts use dedicated shared Drive ownership so authorized owners can both manage uploaded files. Multiple uploads have compression and progress. Downloads are lazy and bytes/object URLs are released after use. Deleting a receipt trashes the Drive file as well as removing the link, with existing rollback protections. Do not replace this with link-only deletion or expose public file access.

## Interface and accessibility

Back is top-left and menu top-right in the header. Help is separate at the screen's top-right. These controls hide on downward scrolling and return on upward scrolling. Theme and sign-out are only in Settings. Screen guides are read-only; narration uses browser speech. Modal background scroll locks support nested scanners. Phone dialogs use full-width readable controls. Transactions use compact multi-line rows without selection/bulk controls; detailed filtering remains collapsible.

The upload tabs are Upload CSV and Upload using AI. Analyze with AI keeps explanation/setup collapsed, while progress/errors stay visible. AI configuration and release version stay visible in Settings; advanced Google client setup is collapsed. Keep this separation when simplifying the interface.

## Versions, tests and documentation

Both Pages and release builds use `scripts/release-version.mjs`. Versions count commits after the v1.0.3 baseline so independently running workflows embed the same version. Settings links to that release. Successful pushes to main create releases with generated notes and a static-site ZIP; Pages deploys independently. Historical v0.x milestones remain at original commits.

Unit tests use synthetic finance data and mocked Google/provider responses. Browser tests use `tests/browser-helpers.ts` and the Sheet fixture, never the actual household ledger. Preview screenshots must also use mocks. Do not send real documents to AI providers as an automated test or retrieve the actual API key for troubleshooting.

`skills.MD` is the AI playbook. Generated context is refreshed during development, before builds and before commits. CI checks it. Its source fingerprint and inventory are automatic; behavioral prose in this document/README still requires an intentional update when rules or workflows change.


## AI provider adapters

Settings chooses a shared `AI_PROVIDER` (`openai` default, `gemini`, `groq` or `claude`). Selection and key replacement are service-owner-only; every status/test/analysis action still requires verified identity, active owner membership and actual Sheet access. `OPENAI_API_KEY`/`OPENAI_MODEL` and `GEMINI_API_KEY`/`GEMINI_MODEL` are independent server properties, preserved on switches and deployments. Neither provider key is returned. The frontend registry contains labels/setup guidance only; the backend owns a separate authoritative allowlist. New adapters need explicit implementation and tests, never arbitrary client-supplied URLs.

OpenAI keeps its Responses/store:false/strict schema path. Gemini uses fixed-host GenerateContent with x-goog-api-key authentication, inline image/PDF parts, responseMimeType/responseJsonSchema JSON output, low thinking and a 16,000-token scan cap (1,024 for the fixed key test); default gemini-3.6-flash. Both return the existing proposal schema and require review before financial writes. Provider errors/blocked/truncated outputs fail without raw upstream messages or automatic retries/fallback. Daily scan quotas and per-actor test cooldowns apply across providers.

Key saves target an explicit allowlisted provider independently of selection. Tests/analysis remain bound to the active provider; a mismatched choice rejects before forwarding documents. An in-flight request uses a single captured key/model/provider. Old deployed clients without provider fields remain compatible. Settings stays expanded, submitted key fields clear immediately, and provider selection is visible in uploads. Gemini data-handling details remain in the dedicated privacy policy; operational screens do not show inline privacy notices. Google login alone does not grant API project quota. Automated tests mock both providers; no live provider key or private statement is accessed.


Groq is also available in the provider selector, with an independent `GROQ_API_KEY` saved once through Settings and optional `GROQ_MODEL` (default `qwen/qwen3.8-27b`, currently a preview). Create the key in [GroqCloud](https://console.groq.com/keys) and review [data controls](https://console.groq.com/docs/your-data). This adapter uses fixed-host chat completions, JSON object mode plus a supplied schema, and client schema validation before review. It supports up to **3 images**, not PDF input; use page screenshots or choose OpenAI/Gemini for PDFs. Limits are checked before provider transmission. Key tests use a fixed prompt and no files; output cap is 1,024 tokens (10,000 for scans). Availability, free quotas and pricing depend on Groq’s current model/project plan. Errors never trigger fallback to another provider.

Local Ollama and native Apple Intelligence are skipped in this browser release. Ollama requires a separately running model server, explicit browser-origin configuration and a secure connection accessible from each device; the Google-hosted service cannot reach a user's localhost. Apple’s Foundation Models integration is a native Swift API, requiring a native app/bridge rather than this GitHub Pages website. These limits are documented here; unsupported providers are not offered in Settings.


Claude is available as **Anthropic Claude** in the same selector. Save an Anthropic workspace key once through Settings; it is stored only as `ANTHROPIC_API_KEY`, with optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). API usage/billing is separate from a Claude subscription. The fixed-host `api.anthropic.com/v1/messages` adapter sends inline base64 image/document blocks, an output_config.format JSON schema, and API version 2026-10-21. It supports images and PDFs, with the same 1–5 file, 2 MB/file, 4 MB/scan app limits. Scans cap output at 10,000 tokens and fixed connection tests at 1,024. Incomplete/refused/malformed results fail without fallback. Preview confirmation is required before any financial writes, and existing provider keys remain saved when switching.


Phone/tablet viewport handling blocks pinch/Safari gestures and double-click zoom while preserving single-finger scrolling and ordinary clicks. The final coarse-pointer CSS rule keeps form controls, including scanner keys, at 16 px to avoid automatic focus zoom; later component styles must not override it. Browser/OS accessibility overrides remain outside application control.


Settings shows only actionable provider selection, saved-key status, key creation/replacement and connection testing, with brief permission/billing notes. Long technical explanations and unavailable-provider descriptions remain in documentation rather than the Settings screen. AI setup remains expanded; app version, appearance/defaults and Google account controls remain available.


Settings and AI upload screens omit privacy callouts and data-policy explanations. The separate privacy policy and maintainer references retain accurate data-handling information. Provider choice, capabilities, setup, progress, errors and review confirmation stay visible where relevant.


### Independent saved keys and active AI

Settings displays all four supported provider rows together, each with a visible text input, Save action and Saved/Not added status. Enter any or all keys without switching the active AI. Saving or replacing a key updates only its server property and does not change `AI_PROVIDER`. Blank fields do not erase saved keys. Previously saved raw keys are never returned; only their saved status is displayed. The separate **Use for uploads** dropdown lists only providers with saved keys, and the server also rejects selecting an unconfigured provider. With no configured active provider, save a key and explicitly choose it. Test saved API key tests the selected AI only.

Key inputs use text (not password) as requested, with autocomplete disabled. Copied surrounding whitespace is trimmed before validation and saving. Non-OpenAI keys accept visible ASCII punctuation, including dots, rather than an overly narrow browser pattern; whitespace inside a key, control/header characters, short and oversized inputs are rejected with a clear message. OpenAI retains its project-key validation. Native pattern validation no longer blocks valid pasted Gemini keys. No real API calls occur while saving; saved status does not certify quota or billing.


### Gemini key-test diagnostics and HTTP 503

The Gemini saved-key test uses the configured model’s documented GenerateContent endpoint, `x-goog-api-key`, a fixed “Reply with OK.” user prompt and a 1,024-token output cap. It omits document schema, system instructions and model-specific thinking settings. A 503 is an upstream service-unavailable response; it does not establish the exact cause, prove a bad key or certify a provider-wide outage. The saved key is preserved.

Only this document-free Gemini key test retries an explicit HTTP 503, with at most three total attempts and roughly 1/2-second exponential delays plus jitter. Retry-After is honored; delays over five seconds or a retry starting beyond a 45-second budget stop retries and display wait guidance. No retries occur after successful, blocked, malformed, quota/auth, other HTTP errors or transport failures. Tests keep one actor cooldown; no scan quota is charged. Failed attempts may still be subject to provider accounting. Document analysis remains single-attempt, and no alternative model/provider is selected automatically. Automated tests use mocks; an explicitly authorized live browser test separately verifies project/model availability without retrieving the saved key.


After a Gemini key test exhausts HTTP 503 retries, the service checks the configured model’s metadata with the same server-side key. A metadata 404 triggers one model-list request and reports only sanitized Gemini generation model IDs. Recognized metadata is distinguished from a missing configured model; neither proves generation capacity or a provider-wide outage. This diagnostic is not run on startup or document scans and never returns keys or raw provider errors.


Gemini document scans use `responseMimeType: "application/json"` with `responseJsonSchema`. Live browser testing found that `responseFormat.text` returned HTTP 503 for the same synthetic PNG/model/key while the compatible configuration produced a valid proposal. The default is `gemini-3.6-flash`; deployments preserve an explicit `GEMINI_MODEL` override. No automatic model/provider fallback occurs.


AI import previews pin the source File to each row using the validated source index, independent of upload order. Receipt upload must succeed before that row can be saved; failure pauses the batch. Uploaded metadata remains in the pending preview for exact-operation Sheet retries, avoiding repeated upload or a changed retry payload. Confirmed rows are skipped. An unconfirmed Sheet save never triggers automatic file deletion because the transaction may already exist; sync and retry the same pending import. Pending imports are not persisted as a competing local ledger. Existing lazy viewing, compression, shared ownership and Drive Trash deletion apply.


Import previews show persistent labels for every editable field, with a two-column layout that adapts to narrow phones. AI review notes stay collapsed; source receipt names remain visible. Confirmed rows become compact, labeled summaries instead of dimmed disabled forms. When every row is saved, the summary shows the imported total and the footer offers Close without an empty import action or another confirmation checkbox. Unconfirmed rows retain their locked fields and exact-operation retry behavior.


Transaction dialogs constrain date/text/select controls to their grid cells and viewport, with readable 16 px inputs on phones/tablets to prevent focus zoom. Horizontal panning is clipped; long forms scroll vertically inside the locked overlay. Touch zoom guards use any coarse pointer or touch capability, including tablets with a mouse/trackpad primary pointer, and capture cancelable pinch/Safari gesture/double-click events. Single-finger vertical scrolling remains enabled. Browser/OS accessibility zoom overrides remain outside app control.


WebKit UI checks use a service-worker-blocked test context so mocked Google requests cannot escape via a worker. Its automation protocol can omit binary File request bodies; the receipt fixture accepts explicit synthetic bytes as a fallback for mocked download responses. Chromium checks still inspect the actual intercepted upload body. No real Google credentials or documents are used.

## Build-time version history

`next.config.ts` runs `scripts/release-history.mjs` to embed public commit subjects grouped by release tags. Untagged HEAD uses the same deterministic version as the release workflow. Settings renders this local searchable history with progressive disclosure; no runtime GitHub API or financial data is involved. Full-history checkout is required and already configured in both workflows.

## Read-only AI financial reviews

`lib/financial-analysis.ts` computes owner/account-scoped facts using shared cash, credit and loan helpers. The UI in `app/financial-analysis.tsx` reads fresh ledger/tags/accounts/settings, displays the exact summary, and requires explicit provider confirmation. Owner/account/period changes discard the old summary, report and consent. Shared accounts are counted once. Current balances and debt use active history, while report flows use the requested dates; ordinary account transfers are excluded from the cash-surplus measure. Calendar months, including inactive months, divide the savings illustration.

The authenticated `analyzeFinances` Apps Script action accepts a bounded aggregate-only schema, optional risk/horizon enums and the selected saved provider. It validates shapes, numeric bounds and output, uses fixed provider endpoints with structured outputs, and has a separate one-minute/ten-per-day actor quota. No financial Sheet-write path or model tools are available. Report text is rendered as escaped React text. Provider failures are sanitized and never automatically retried. Reports, prompts and financial summaries are not persisted by this app; server properties retain only usage counters.

Numeric charts and the savings calculator come from deterministic facts, not AI-authored numbers. The model is instructed to distinguish card settlements, loan principal, one-off income and investment contributions, flag missing records, and make only conditional educational investment suggestions without individual securities, live rates/tax rules or guaranteed returns. Automated tests use synthetic data and mocked providers; they do not send household records to an AI.
