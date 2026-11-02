# Budget Tracker architecture

## Runtime and deployment

The website is a static Next.js export hosted on GitHub Pages. Client components implement navigation and local UI state. Direct authenticated Google Sheets requests read and write finance data. The existing Google Apps Script service handles shared receipt ownership and optional OpenAI document analysis. It is not a general financial-write backend.

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

AI analysis sends selected documents and sanitized active tags through the authenticated Apps Script service to OpenAI Responses with strict output schema and `store:false`. It returns proposals only. Review confirmation is required before the ordinary audited save path writes selected entries. Originals are not automatically attached as Drive receipts. Raw provider error messages and credentials are never exposed; quota/billing errors are distinguished from temporary rate limits.

Only the service owner can save/replace the shared OpenAI key through the Settings password field. The field is cleared after submission; the key is stored only in Script properties, never returned or placed in Sheet/cache/backups. Settings stays expanded and shows configured status. Restricted keys need Responses Write; document inputs are inline and do not require Files permission. Saving confirms storage, not billing or model availability. Settings also offers Test saved API key: an explicit, tiny billable Responses call using the configured model, capped at 16 output tokens with store:false. It sends no financial data or documents, returns no raw model text or key, reuses sanitized provider errors and is limited to one test per minute per authorized owner. Successful tests establish Responses/model access, not document extraction quality.

Receipts use dedicated shared Drive ownership so authorized owners can both manage uploaded files. Multiple uploads have compression and progress. Downloads are lazy and bytes/object URLs are released after use. Deleting a receipt trashes the Drive file as well as removing the link, with existing rollback protections. Do not replace this with link-only deletion or expose public file access.

## Interface and accessibility

Back is top-left and menu top-right in the header. Help is separate at the screen's top-right. These controls hide on downward scrolling and return on upward scrolling. Theme and sign-out are only in Settings. Screen guides are read-only; narration uses browser speech. Modal background scroll locks support nested scanners. Phone dialogs use full-width readable controls. Transactions use compact multi-line rows without selection/bulk controls; detailed filtering remains collapsible.

The upload tabs are Upload CSV and Upload using AI. Analyze with AI keeps explanation/setup collapsed, while progress/errors stay visible. AI configuration and release version stay visible in Settings; advanced Google client setup is collapsed. Keep this separation when simplifying the interface.

## Versions, tests and documentation

Both Pages and release builds use `scripts/release-version.mjs`. Versions count commits after the v1.0.3 baseline so independently running workflows embed the same version. Settings links to that release. Successful pushes to main create releases with generated notes and a static-site ZIP; Pages deploys independently. Historical v0.x milestones remain at original commits.

Unit tests use synthetic finance data and mocked Google/provider responses. Browser tests use `tests/browser-helpers.ts` and the Sheet fixture, never the actual household ledger. Preview screenshots must also use mocks. Do not send real documents to OpenAI as an automated test or retrieve the actual API key for troubleshooting.

`skills.MD` is the AI playbook. Generated context is refreshed during development, before builds and before commits. CI checks it. Its source fingerprint and inventory are automatic; behavioral prose in this document/README still requires an intentional update when rules or workflows change.
