# Budget Tracker

A shared personal-finance app with Google sign-in, Google Sheets records and private Drive receipts. The website runs on **GitHub Pages**; a small Google Apps Script service manages shared receipts and optional AI document extraction (OpenAI, Gemini, Groq or Claude).

Live site: [Budget Tracker](https://ramasami.github.io/expense-tracker/).

## Run locally

Use Node.js 22 and Python 3:

```sh
cd ~/Projects/Expense_Tracker
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. Keep the terminal running. For a production-style static preview:

```sh
npm run build
npm start
```

The preview server uses port **4173**. `npm run typecheck`, `npm test` and `npm run test:browser` run TypeScript, unit/integration checks and Playwright browser checks. Browser tests use mocked Google/OpenAI responses and do not change the real workbook. Playwright Chromium must be installed for browser tests.

## Hosting and configuration

Pushing `main` runs `.github/workflows/pages.yml`: install dependencies, run unit tests, build static files, upload `out/`, deploy to GitHub Pages. The workflow sets `PAGES_BASE_PATH` for the repository path. The app has no Next.js server routes, server actions or hosted Node.js backend.

Optional build variables are documented in `.env.example`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Override the public Google Web OAuth client ID. |
| `NEXT_PUBLIC_RECEIPT_SERVICE_URL` | Override the public authenticated Apps Script endpoint. |

Public frontend variables are visible to visitors. **Never put an OpenAI API key, Google client secret, refresh token or owner token in them.** The optional scanner key belongs only in Apps Script’s Script properties.

## Access, owners and sessions

- The first screen requires Google sign-in. A Google-verified email must map to an **active owner** in App Settings and independently have access to the private Budget Sheet. Editing requires editor access.
- Owners can have several accounts; accounts can have several owners. Adding an owner email does not grant Google Sheet or Drive permissions. Assign the owner and share the Sheet separately.
- On sign-in the app defaults to the mapped owner. **All** selects the household view. Owner-specific account toggles show only that owner’s active accounts.
- Keep the workbook’s General access **Restricted**. GitHub Pages serves public code; it does not make the private Sheet accessible.
- The app stores a short-lived Google access token, expiry and profile locally. Refreshing or reopening an installed phone app reuses a valid session. Sign-out, expiry or clearing site data ends it. There are no browser refresh tokens.
- Online session restoration rechecks Google authorization and owner/Sheet access. The Apps Script service independently checks the caller’s token, application client ID, expiry, verified email, active owner mapping and Sheet access on each request.

### Google OAuth setup

Enable the Google Sheets and Google Drive APIs. Use a **Web application** OAuth client with these authorized JavaScript origins:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `http://127.0.0.1:4173` for the static preview
- `https://ramasami.github.io`

Origins contain no repository path. This popup token flow does not need redirect URIs. The app requests Sheets, `drive.file`, OpenID, email and profile access. The public Web client ID is configured by default and can be overridden in Settings or at build time.

An External OAuth app in Testing also needs its permitted test users configured in Google. Production removes the manually maintained test-user list, subject to Google’s consent, verification and user-cap restrictions. Google Sheet permission and active owner mapping remain required in either case.

## Navigation, help and layout

- **Back** returns to the previous in-app screen. It restores the previous owner, reporting dates and shared transaction/list filters and scroll position. The in-memory history is limited to 30 visits and clears on sign-out or reload. It never leaves the app for an unrelated website.
- The top toolbar puts **Back on the left and menu on the right**. **Help** sits separately at the top right of the screen. Theme selection and sign-out are available only in **Settings**. The toolbar and Help hide when scrolling down and reappear after a small upward scroll or when reaching the top. They stay available while navigation or a dialog is active. Keyboard focus reveals it too.
- **Help** is available on every main screen, sign-in and the privacy page. Each guide has short steps, examples, direct step selection and a quick interactive check. **Show me** highlights an available control without clicking it or writing data; **Continue guide** resumes the tutorial.
- Optional **Read aloud** uses the browser’s speech service where supported. Guide dialogs support Escape, keyboard focus containment, background scroll locking and reduced-motion preferences. Guides never submit financial changes.
- Detailed filters, lender history, statement snapshots, forecasts and recovery live in expandable panels. Lists and transactions adapt to narrow screens; transaction rows use compact cards rather than a wide table.
- Light/dark themes and Indian rupee formatting are supported. Finance dates use Asia/Kolkata. Supported touch browsers block pinch zoom; the operating system/browser can still override viewport restrictions.

## Source of truth, syncing and offline use

Google Sheets is authoritative. Workbook: `12AisxtgYgO2fN2tNzbzDNfX4hyAZvksyV2DtOInc5Ls`.

After a verified sign-in, the app may show that account’s last validated IndexedDB cache, then refresh the required Sheet collections. Financial data is never read from the superseded browser-only store. Only confirmed Sheet reads and writes replace the financial cache. Failed saves do not become local saves.

- Pull down at the top, press **Refresh data**, or use Settings sync to force a fresh read.
- Startup and reconnect refresh the visible screen. Recently fetched collections are reused for 60 seconds; navigation requests only missing or older required collections. Required ranges are grouped in `values:batchGet`. There is no periodic Sheets polling.
- The dashboard and transaction flow need ledger, tags, accounts and owner settings. Additional collections and audit history load when a screen or detail view needs them. The recovery panel fetches its additional collections when opened.
- Offline/stale data has a clear warning and last-sync information. **Edits, imports, uploads, deletion and recovery are disabled until sync succeeds.** A screen with no cached data is unavailable rather than showing invented empty records.
- The versioned service worker stores only the static app shell. API responses, credentials and receipt bytes are excluded. Offline reopening works after a successful online app load and Sheet sync, while the saved verified session is unexpired. Google cannot recheck revoked permission offline; cached access ends at token expiry or sign-out.
- Reconnecting verifies authorization and syncs before enabling edits. Expired or unverified sessions need online sign-in. New receipt previews and AI scans need connectivity.

## Screens and features

### Dashboard

The dashboard greets the signed-in owner and opens with **All Time** savings. Owner/account toggles narrow the view. **Current Balance** and account cards are calculated dynamically from opening balances and Sheet transactions; historical balance confirmations do not freeze them. Balances are independent of report dates.

Income, paid expenses, investment contributions and savings use the selected report dates. Savings is income less expenses; net cash additionally accounts for investment contributions and loan principal payments. Normal transfers do not inflate income or expenses. Clickable totals/charts drill into the corresponding transactions. Reported credit-card statement snapshots remain dated snapshots, separate from recorded unpaid charges.

### Transactions

- Required **From account** dropdown identifies the ledger account. Names include the account and owners. **To account** is enabled for transfers and must identify another active account, except linked card payments may use the same bank account.
- Types: Expense, Income, Investment and Transfer. New expenses default to **Debit**, which affects cash immediately. **Credit Card** purchases are deferred and require a named card linked to that account.
- Expense tags come only from **Expense Tags**. The searchable dropdown opens with all valid choices and filters while typing. Historical unlisted tags remain readable but cannot be chosen for new entries.
- The amount field accepts arithmetic such as `123+345+13*2`, with validated numerical expressions and rupee precision.
- Search includes merchant, notes, tags, owner, card, payment and account names. Sorting covers newest/oldest, largest/smallest amount and merchant name. The collapsed Filters panel includes tag, type, account, payment method, receipt presence and amount bounds. Reporting dates and owner/account scope are available above.
- Compact rows show relevant details across several lines. Edit, delete, transaction details, receipts, exports and **Recently deleted** are available without horizontal table scrolling.
- Normal deletions are soft and audited. **Recently deleted → Delete permanently** removes a previously deleted transaction from its Sheet row after confirmation. It cannot be restored through the app; existing audit history remains. Delete attached receipts first (through transaction details) so their Drive files are cleaned up. Row clearing preserves D/I formulas and never shifts other transaction identities. Linked paid charges cannot have financial details changed until the associated payment is deleted. Linked card/loan payments are corrected by deleting and recording the replacement.

### Credit Card Bills

Configure any number of uniquely named cards under **Accounts → Edit account → Credit cards**. Each can have a statement day and due day. Short months use their last valid day; due dates always follow the relevant statement close.

The screen separates **Billed, Unbilled and Overdue** recorded purchases. These classifications use transaction dates and configured days; bank posting dates and the bank’s actual statement remain authoritative. Pick an account/card, search charges and sort by date, amount, merchant or earliest due date.

All listed charges start selected. Review unknown imported purchases and explicitly confirm that they remain unpaid. Choose **Pay selected**, the paying account and amount actually paid at the bank. This app **records** the payment; it does not initiate a bank transfer.

Partial payments allocate oldest-first in paise and leave the remainder unpaid. Each active payment stores its per-charge allocations. Deleting a payment reopens its amounts; restoring validates that the charges have not been overpaid elsewhere. Retrying an unconfirmed payment uses the same operation ID. Cash leaves the paying account once; the card’s linked bank account does not gain cash as though it were a normal transfer.

Partial statement imports retain reported outstanding balances and coverage dates separately. The app does not invent missing charges or guess historical settlement links. Card refunds do not become bank income. Historical statement card-payment records without linked charge IDs remain recoverable.

### Loan Tracker and forecasts

Loan configurations include the linked account, original principal, annual rate, scheduled monthly payment and principal/interest paid before tracking. Opening paid totals create no new cash transactions. Search by loan name, filter by account and sort by name, remaining principal or rate.

**Pay loan** records the actual paying account, date, principal and interest split. Both portions leave bank cash, only interest counts as an expense, and principal reduces debt. Overpayment and mismatched splits are rejected against a fresh Sheet snapshot. Deleting a repayment restores principal. Lender snapshots, supplied history and inferred-allocation notes remain explicitly identified.

**Payoff forecast** compares monthly payment, extra monthly payment, a one-time prepayment and an alternative rate. It shows estimated payoff, future interest, time/interest saved and an on-demand schedule. It assumes monthly reducing-balance interest, a fixed entered rate and the first future payment next month. Fees, daily accrual, currently unpaid interest and future changes are excluded. A payment that does not exceed monthly interest is flagged. Scenarios never alter balances or create repayments. The general model follows the [CFPB explanation of amortization](https://www.consumerfinance.gov/ask-cfpb/what-is-amortization-and-how-could-it-affect-my-auto-loan-en-771/).

### Expense Analytics

Review category, merchant and timing breakdowns for the selected owner and reporting dates. Supported chart/category drill-downs open matching transactions. Statement coverage and transaction classification determine what the charts include; no missing history is invented.

### Investments

Track contribution transactions, trends and category allocation. Contributions are cash invested, **not** a live portfolio market valuation. Search and sort allocation categories, then drill into matching transactions. Legacy holdings records remain part of backups/recovery, but this screen is not a live portfolio manager. No automatic broker connection or live-price feed is included.

### Income & Cash Flow

Review income, spending, savings trends, owner comparisons and ledger cash through the reporting cutoff. Loan principal, investing and deferred card purchases are distinguished from everyday paid expenses. Use transaction drill-downs and bank reconciliation to investigate unexpected figures.

### Accounts, owners and bank reconciliation

Manage accounts, opening balances, owners and named credit cards. Lists offer search, name/amount/last-update sorting and relevant status/type filters. Owner email mappings determine the default signed-in owner but never change Google sharing permissions. Removing owners/accounts retains historical records; linked active loans or unpaid charges can prevent invalid removal.

Open **Reconcile bank statement** and enter the statement’s date and **closing/book balance**. Available funds after bank holds can differ from book balance. The panel compares ledger cash through that date, shows possible duplicate entries and saves a dated comparison in App Settings. It never inserts a balancing expense or changes the opening balance. Changed ledger data requires a fresh comparison before saving; saved comparisons retain their historical result.

### Expense Tags

Create and organize valid expense, income, investment and transfer tags. Search by name, sort by name/usage amount/recent changes and filter by type or status. Renaming retains identities; archiving retains historical use. Tag merges deliberately reassign references after confirmation. New transaction and budget choices use the managed tag list.

### Monthly budgets

Choose a calendar month and create a one-month or repeating limit, optionally tied to an account. A budget can include **all expense tags, one tag or multiple selected tags**. The picker supports search and checkboxes. Existing single-tag budgets remain compatible.

A transaction matching a selected tag counts **once within that budget**. Purchases count on their transaction date, including credit card purchases; linked card bill payments are excluded, and only loan interest counts as spending. Different overlapping budgets can count the same purchase in each limit and are labelled accordingly.

Cards show spent, remaining, near-limit/over-budget status and progress. Repeating budgets reset spending each month. Search budgets/tags, filter by tag, and sort by name, usage, limit or remaining amount. Reporting month is independent of dashboard dates. Deleted budgets can be restored from Settings recovery.

### Financial Goals

Goals are flexible targets, not limited to investments or net worth: examples include an emergency fund, planned purchase, investment milestone or debt-payoff target. Set the target, funded amount, date and monthly contribution. Progress and approximate funding time are based on entered values. Updating a goal does not automatically reserve bank funds or create a real transaction. Search, sort and status filters organize the goal list.

### Recurring Transactions

Manage amount, account, tag, frequency, next date and schedule status. **Run due schedules** explicitly writes due entries and advances dates. Nothing runs automatically while the website is closed. Pause/end schedules when plans change; already-recorded transactions remain in the ledger. Search, sort and status/type filters are available.

### Audit History

Inspect actor, timestamp, description, action and before/after values for audited changes. Search, owner/date scope, action filters and newest/oldest ordering help locate an event. Recovery happens through the record’s restore flow; audit entries remain historical evidence.

### Reports and exports

Choose financial summary, category/tag/merchant, contribution, owner comparison, account-statement and audit reports. Search report names and sort choices alphabetically or in the default order. Available CSV, XLSX and PDF downloads use the selected scope. Reports are snapshots; editing one does not update the app. JSON backup export fetches a fresh Sheet snapshot. Local backup restore is disabled so exports never replace the shared source of truth.

### Settings and recovery

Manage appearance, default view, public OAuth client configuration, synchronization, fresh JSON exports and privacy information. **Recently deleted & archived** fetches recoverable transactions, accounts, budgets, tags, loans/comparisons, goals, schedules and holdings on demand. Choose a category, search, filter status and sort by name or change date.

Restoring checks versions and relevant links. Some linked records must be restored first, and a payment cannot be restored if its charges are already settled or its principal would exceed the loan balance. There is no automatic record purge. Files explicitly removed from Google Drive are not recreated by restoring a transaction.

## Bills and receipt attachments

Save a transaction, open its description/detail panel and upload multiple JPEG, PNG, WebP or PDF files, up to **20 attachments per transaction**.

- Input images: up to **20 MB**. PDFs: below **5 MB**. Final Drive upload: below **5 MB**.
- Images above 300 KB are resized to a maximum 2048-pixel edge and encoded as WebP at quality 0.82 when smaller. Small images/PDFs stay unchanged. This is lossy image compression; retain originals when detail is important. Browsers decode compressed images directly.
- Two uploads run concurrently, then one Sheet save links the successful batch. Files show preparation, compression savings, actual upload-byte progress and completion/failure. Retry individual failures; original-file content hashes help reuse completed uploads for the same transaction.
- New uploads are owned by the shared Google service in a private dedicated Drive folder. Any active, Sheet-authorized owner can upload or delete shared receipts, regardless of who uploaded them. The server checks folder membership and service markers; files are not public links.
- **View** lazily fetches bytes only when requested, with download progress and cancellation. Images also use native lazy loading. Object URLs are released after closing previews/sign-out; file bytes are not cached offline.
- Delete moves the actual Drive file to **Trash** and removes the Sheet link only after confirmation. If the Sheet update fails, the service attempts to restore the file as rollback. Drive Trash retention still applies; there is no permanent-delete endpoint.
- File upload and Sheet linking are separate operations. If linking is abandoned, a completed file can remain in Drive. Older directly uploaded files may retain uploader-only deletion rights; they are not silently replaced or falsely reported as deleted.

Deployment and permission details: [apps-script/README.md](apps-script/README.md).

## Statement import and AI scanning

Open **Transactions → Import statement**. Uploading, mapping, scanning and previewing do not write financial records.

### CSV statements

Upload up to **500 rows / 5 MB**. Map date, description and either signed amount or separate debit/credit columns. Supported dates are ISO or numeric day-first/month-first dates. The amount convention is explicit. Choose the destination bank/card, then edit dates, descriptions, amounts, types, tags and transfer accounts.

Possible duplicates against the current ledger and within the file are skipped by default. Selecting a flagged duplicate explicitly permits it. Previews show **25 rows per page** without losing selections. Only selected records are imported. Use the dedicated card/loan payment screens for entries needing charge allocations or principal/interest links.

Each row uses a stable operation ID. Confirmed rows are marked saved and are not imported again; an uncertain row locks its fields. Use the in-dialog sync action, then retry unchanged. New concurrent duplicates are checked against fresh Sheet data before a write.

### AI bills, screenshots and PDFs

Choose **Upload using AI**, select **1–5 JPEG/PNG/WebP images or PDFs**, and click **Analyze with AI**. Existing image compression is applied first. Each prepared file must be below **2 MB**, with **4 MB total** per analysis. Large PDFs must be split before upload. The service limits each owner to **20 analyses per day**.

The authenticated Apps Script service sends only the selected documents and active tag names/IDs/types for extraction. The Google token, owner email and the rest of the ledger are not sent to OpenAI. It uses the [Responses API image inputs](https://developers.openai.com/api/docs/guides/images-vision) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) to return bounded proposals. Images/document text are treated as data, not executable instructions. The extraction endpoint has **no financial Sheet-write path** and no model tools.

Review warnings, dates, amounts, currency, accounts and tags. Uncertain, duplicate or incomplete entries are skipped by default. Foreign/unknown currency requires manual review and an INR amount; there is no invented exchange rate. Recognized card/loan payments needing links are flagged for the dedicated payment flow. Running balances, totals and loan-principal summaries are not intended as expense transactions.

You can also start scanning from **Add transaction → Upload bill or image**. Canceling the scanner returns to your untouched manual draft; after confirmed imports, closing it dismisses the original add form.

The final **“I reviewed the selected entries…”** confirmation is required before import. Editing a proposal clears that confirmation. Even then, only pressing the import button writes selected records through the existing Sheet validation/audit flow. Scanned originals are **not automatically attached as Drive receipts**; attach them separately if you want to keep them with a transaction.

### Configure the scanner API key

The scanner is intentionally unavailable until a server key is configured. Other features work normally without it.

1. Recommended: sign in as the service owner (Ram), open **Settings → AI bill & statement scanner**, paste a key into the **OpenAI API key** text field, then choose **Save** in that provider’s row. Create a **Restricted project API key** with **Responses → Write** enabled; Read-only cannot scan. Other endpoints can stay disabled (including Files, because documents are sent inline). Your OpenAI project also needs API billing and access to the configured model. The app clears the field after submitting; it never writes the key to browser storage, Sheet data, logs or backups. Only the service owner can save/replace the shared key; other authorized owners can scan. Saving confirms storage, and the first scan checks provider permissions/billing.
2. Alternatively, open the existing [Apps Script project](https://script.google.com/home/projects/175q3amnRU4HHfmogHaJN7eKwFqxSivLn_ACf6Dp4uZbCJHGZRTM5P2Qu/edit) as its owner.
3. This is a **one-time setup**: the key stays in server-side Script properties across refreshes, sign-outs, devices and deployments until removed or replaced. The scanner checks the server and displays **Configured** instead of setup instructions once saved. In **Project Settings → Script properties**, add `OPENAI_API_KEY` with an API key for a funded/authorized OpenAI API project. Use only the authenticated Settings text field when configuring through the app; never put it in a frontend environment variable, source file or Git.
4. Optionally set `OPENAI_MODEL`; the default is `gpt-4.1-mini`. Select a model supporting image/PDF inputs, Responses and strict JSON-schema outputs.
5. Ensure the Apps Script deployment includes the current source, then use the scanner. No new Google OAuth scope is needed beyond the existing external-request permission.

No API key is sent back to the browser. API usage/billing and OpenAI’s applicable data policies still apply. The request uses `store:false`; this is not a promise of zero retention. Document analyses are never automatically retried. Live model quality/availability requires your configured key; automated tests mock the provider and do not incur charges.

## Data layout and write integrity

| Sheet / field | Role |
| --- | --- |
| Expense Ledger | Financial transactions. Existing D/I array formulas are preserved. |
| Expense Tags | Valid managed tags and their stable IDs. |
| Accounts | Account/owner/card configuration, opening values and historical snapshots. |
| App Settings | Owner mappings, preferences, loan configurations and saved reconciliations. |
| Budgets, goals, recurring and holdings tabs | Supporting records for their corresponding screens. |
| Audit Log | Before/after records, actor, operation ID and request signature. |
| Ledger W (`receipts`) | Attachment metadata / Drive IDs. |
| Ledger X (`transactionDetails`) | Credit timing, card identity, payment allocations, loan split and import metadata. |

Setup first makes recovery copies of compatible source tabs, adds stable IDs/metadata and prepares supporting collections. An incompatible existing layout stops setup rather than overwriting it. Writes use authenticated Google requests, record-version/fingerprint checks, stable retry operation IDs, audited batches and readback confirmation. Formula-generated financial columns are not overwritten.

Browser-only financial writes cannot guarantee a global lock across devices or concurrent manual Sheet edits. A conflict requires reviewing the latest record. Failed/uncertain operations must be retried with their original fields; do not replace them with local writes. Historical statement snapshots and inferred lender allocations remain labelled and separate from dynamically calculated cash balances.

## Known boundaries

- No closed-app push notifications; these were deferred.
- No automatic bank connection, live investment prices, background schedule execution or automatic bill payment.
- Offline data is read-only, and expired logins need connectivity.
- AI extraction is a review aid, not guaranteed OCR or automatic bookkeeping; a server-side key is required.
- Goal funding and forecast scenarios do not create real transactions or reserve funds.
- Service quotas, Google authorization limits and Drive recovery rules apply. The public app code is not a substitute for private workbook permissions.


## Releases

Every push to `main` starts the independent **Release Budget Tracker** workflow. It runs unit tests and builds the static site before publishing `v1.0.<patch>` with generated release notes and a downloadable `budget-tracker-v1.0.N.zip` site build. Failed checks do not publish a release. The shared version script counts commits after the v1.0.3 baseline; both the site and release builds use that same immutable version. Settings always shows the version and links its release notes. Re-running a workflow keeps an existing release and its original assets. Release builds do not replace the separate GitHub Pages deployment workflow.

Historical major milestones are tagged `v0.1.0` through `v0.10.0`, covering secure Sheet-backed access, shared/offline receipts, compact transactions, owners/accounts, account switching, cards/loans, statement reconciliation, dynamic balances, planning/recovery, and guides/AI scanning. These tags point to the original commits; they do not rewrite history or redeploy an old version. The original `0.0.x` versions are preserved.


### Scanner HTTP 429 troubleshooting

The scanner distinguishes OpenAI exhausted credits, project/organization spending limits, usage limits and temporary request limits using provider error codes. Billing/quota problems require checking [OpenAI Billing](https://platform.openai.com/settings/organization/billing/overview) and applicable limits; waiting alone does not resolve them. For temporary rate limits, follow the displayed minimum Retry-After delay and try fewer pages. Unknown 429 codes remain explicitly ambiguous. No raw provider error message or key is exposed, and document scans never automatically retry. Existing keys stay saved. See the [official OpenAI error guide](https://developers.openai.com/api/docs/guides/error-codes).


### AI document inference and credit card uploads

Image/PDF scans default to **Auto** for statement kind and date format. The scanner infers bank, credit card, bill/receipt or mixed document types and DMY/MDY/YMD date order from visible evidence; ambiguous numeric dates remain unselected for review rather than being guessed. You can override these fields before analysis. The shared image/PDF upload includes a **Credit card statement** checkbox. When checked, choose a configured card or leave **Auto · identify from uploaded file** selected. CSV card statements retain their existing card selector. Detected details appear above the review list. A card is matched only when its visible name identifies a unique configured card in the selected account; otherwise choose it in preview. Statement totals, balances and limits are not imported as expenses. Card purchases remain deferred, payment history uses the linked bill flow, and uncertain settlement stays unknown until confirmed.

**Analyze with AI** keeps explanatory/setup text inside the collapsed **How it works & setup** panel. Progress and failures remain visible. AI configuration in Settings is always expanded; a previously saved key is never returned or requested again, and the blank text field is only for deliberate replacement.


### Responsive layout review

The main screens are checked at desktop and phone widths with no horizontal page overflow. Phone dialogs use full-width labeled controls; scanner uploads span the available width and explanatory text stays collapsed. Transaction heading actions wrap below the title on small screens. Settings keeps version, AI configuration and everyday preferences visible while advanced Google client setup stays collapsed. The navigation brand remains on one line and long menus can scroll independently.


The import dialog has **Upload CSV** and **Upload using AI** tabs. **Download sample CSV** provides example DMY dates and Debit/Credit columns; it does not import or change anything automatically. Select the destination account, build a preview and choose valid tags before confirming any rows.


## AI maintainer documentation and automatic updates

- [skills.MD](skills.MD): repository playbook and task-to-module map for AI assistants.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): runtime, finance rules, authorization, data flow, imports, receipts, deletion, releases and testing boundaries.
- [docs/AI_CONTEXT.generated.md](docs/AI_CONTEXT.generated.md): deterministic source fingerprint, screen list, commands, module/export map and test inventory. Never hand-edit it.
- [AGENTS.md](AGENTS.md): repository instructions require behavioral documentation to be updated with relevant changes.

`npm run dev` automatically watches relevant source/config/documentation files and refreshes the generated context after edits. `npm run build` refreshes it first. `npm run docs:sync` refreshes it manually, `npm run docs:watch` starts just the watcher, and `npm run docs:check` verifies it without changing files.

`npm install`/`npm ci` installs the local pre-commit hook via the prepare script (skipped in CI). The hook regenerates context from the **staged tree** and stages only that generated file, preserving unrelated unstaged work. A user's different existing Git hook configuration is respected; use `npm run hooks:install` to check installation. Both Pages and release CI workflows fail on stale context, so changes made without local hooks must include a `docs:sync` refresh.

The automatic document is a current source inventory, not an AI-written behavioral changelog. README and architecture explanations still need intentional updates when rules change; AGENTS and skills.MD explicitly require that. No OpenAI calls, API keys or real financial data are used for documentation generation.


### Test the saved API key

In **Settings → AI bill & statement scanner**, choose **Test saved API key** after a key is configured. It sends a fixed connection prompt using the selected provider’s saved key/model. OpenAI uses Responses with `store:false` and a 16-token output cap; Gemini and Groq use their adapters with a 1,024-token test cap. This uses API billing or the selected provider’s free quota; no statement, image or financial data is sent. Successful tests show connection status and test time. Invalid/revoked keys, model permissions, billing/quota and temporary rate limits show sanitized actionable messages. Tests run only on explicit clicks, never automatically, and are limited server-side to one per minute per authorized owner. A test checks provider/model access; it does not guarantee every document will parse correctly.


### Choose an AI provider

**Settings → AI bill & statement scanner → Use for uploads** selects **OpenAI (ChatGPT)**, **Google Gemini**, **Groq** or **Anthropic Claude** for all authorized owners. Only the service owner can change this shared choice or save keys. Existing OpenAI setups remain selected by default. Save each provider’s key once; switching providers preserves saved keys across sign-ins, devices, refreshes and deployments. Test saved API key checks the selected provider with a fixed prompt, no financial documents, and a once-per-minute actor limit. API charges or free quota apply. Google login authenticates app/Sheet access; it does not supply Gemini API quota or replace the server-side API credential.

For Gemini, create a key in [Google AI Studio](https://aistudio.google.com/api-keys), restrict API access to **Generative Language API**, and paste it into the Gemini text field. Browser referrer restrictions do not work for Apps Script requests. Keys stay only in Script properties and are never returned, cached or included in Sheet backups. The default model is `gemini-3.6-flash`; the service owner can override `GEMINI_MODEL` with a compatible model. No real key is needed for automated tests.

Selected images/PDFs and active tags go only to the explicitly selected provider. Uploads display the provider; a change while a dialog is open fails safely and requires reopening it. There is no automatic fallback or document-analysis retry. All adapters return the same validated review proposals, and confirmation remains mandatory before ordinary audited Sheet writes. Gemini quota, key/model access, blocked and incomplete responses fail visibly without importing data.

**Gemini free-tier privacy:** free inputs/outputs may be used to improve Google products and reviewed by humans. Do not submit sensitive or personal statements under unpaid terms; use redacted documents or an eligible paid project. Free access is model/project/region/quota dependent, not guaranteed. See [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [data terms](https://ai.google.dev/gemini-api/terms); data-handling details are available in the dedicated privacy policy.

Future providers require an entry in `lib/ai-providers.ts`, an allowlisted Apps Script adapter/configuration and tests. Arbitrary provider URLs are deliberately unsupported to protect keys and financial documents. Provider metadata never contains credentials.


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


### Scanned source receipts

Confirming an AI import also saves each transaction’s source image or PDF in **Bills & receipts**. Review alone saves no Drive files. Upload progress is shown; a failed upload pauses the import before saving that row. Sync/retry an unconfirmed import in the same preview to reuse its uploaded receipt and avoid duplicate transactions. Several rows from one statement get independent attachments, so deleting one receipt does not break the others. Receipts remain available after refresh and load only when opened.


Import previews show persistent labels for every editable field, with a two-column layout that adapts to narrow phones. AI review notes stay collapsed; source receipt names remain visible. Confirmed rows become compact, labeled summaries instead of dimmed disabled forms. When every row is saved, the summary shows the imported total and the footer offers Close without an empty import action or another confirmation checkbox. Unconfirmed rows retain their locked fields and exact-operation retry behavior.
