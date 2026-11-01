# Budget Tracker

A static GitHub Pages app for Ram and Varsha. Google Sheets is the sole source of financial records; Google Drive holds uploaded bills and receipts. There is no application backend or Apps Script.

## Access and sessions

The first screen requires Google sign-in. Only verified profiles for `ramasami.official@gmail.com` and `tnvarsha.99@gmail.com` are accepted. The supplied public Web OAuth client ID is configured by default; no client secret is included in the site.

A short-lived Google access token and its expiry are saved in `localStorage` on this device, so refreshing, closing and reopening the phone's installed Chrome app does not open another login prompt while the token is valid. On every reload, the app verifies that token and the approved account with Google before fetching the workbook. The session ends on sign-out, Google token expiry, or clearing site data. Closing the tab or installed app does not end a valid saved session. Expired tokens require sign-in again; this static app does not store refresh tokens. Local storage is readable by scripts on this origin, so treat it as a short-lived browser credential. Neither session credentials nor receipt bytes are included in exports.

In Google Cloud, enable **Google Sheets API** and **Google Drive API**. Keep the OAuth app External / Testing with only the two approved emails as test users. Add these authorized JavaScript origins to the Web application client:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `https://ramasami.github.io`

Redirect URIs are not needed for this popup token flow. The app requests `spreadsheets`, `drive.file`, `openid`, email and profile scopes. Users must approve file access for receipt uploads. An optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID` build variable or Settings client ID can override the default.

**Workbook permissions enforce data privacy.** GitHub Pages serves public application files, and client-side checks alone cannot protect a publicly shared spreadsheet. Set the workbook's General access to **Restricted** and grant editor access only to the two approved accounts. The app uses authenticated Sheets requests, so it does not need a public workbook. Keep the Google test-user list restricted too.

## Data behavior

Workbook: `12AisxtgYgO2fN2tNzbzDNfX4hyAZvksyV2DtOInc5Ls`.

Every startup fetches fresh records from Google Sheets after validating the saved login. There are no anonymous CSV reads, IndexedDB reads or writes, local financial snapshots, merges with browser copies, or browser-only save modes in the application flow. Old browser financial records are ignored. Browser storage is used only for the login session, OAuth client configuration and display theme.

Failed reads and writes clear the displayed financial snapshot and show an error/retry screen. A failed write never silently switches to browser storage. Retrying a pending write uses operation metadata and audit receipts to check the outcome. A Google save is reported as successful only after readback confirms it. JSON exports fetch a fresh Sheet snapshot; reports export the current successfully fetched view. Neither is used as an offline fallback, and local backup restore is disabled.

Transactions write to **Expense Ledger**; tags come only from **Expense Tags**. Historical ledger categories missing from that list remain readable but are not offered as new tags. From account and To account are text inputs. Entering an existing managed account's name links its ID for balance calculations; other names remain free text. Transfers require two different accounts.

Transactions support dedicated search, date and person filters, tag/type/account/payment/receipt filters, minimum/maximum amounts, and date/amount/merchant sorting. Account filtering matches both the source and destination. Reset clears the transaction filters and returns to All Time / Combined.

The dashboard opens in **All Time** and shows **Total savings = income − expenses**, including money contributed to investments. Net cash movement additionally subtracts investment contributions. Transfers do not inflate income or expenses.

## Bills and receipts

Save a transaction, then click its merchant/description to open the detail panel. Select multiple JPEG, PNG, WebP or PDF files at once, up to **20 attachments per transaction**. Input images can be up to **20 MB**; PDFs must be under **5 MB**. Photos larger than 300 KB are resized to a maximum edge of 2048 pixels and encoded as WebP at quality 0.82 when that makes them smaller. Files uploaded to Drive are capped at 5 MB. Small images and PDFs are left unchanged. Browsers decode compressed images automatically when opened; there is no separate unzip step. Compression reduces file size with some image-detail loss; keep your originals if needed.

Files are uploaded directly to the signed-in user's Google Drive and shared as reader with the other approved account; no public file link is created. Metadata and Drive IDs are saved in the transaction's `receipts` column (**W**) in Expense Ledger. The app adds this column to an existing compatible ledger without changing the financial cells or array formulas. Two uploads run at a time, followed by one Sheets save for the batch. Failed files are reported individually; successful uploads are linked to the transaction, and failed files can be retried. Compression savings are displayed after upload. Per-file progress bars show preparation, actual upload bytes, sharing and completion; opening a receipt shows download byte progress, with cancellation when the preview closes. Content hashes of the original file allow retries of the same transaction/file upload to reuse existing files. A file upload and the Sheet link are separate Google operations: if linking fails, retry the same file after reconnecting to complete the link. A file may remain in Drive if linking is abandoned.

Receipt images and PDF bytes are fetched only when **View** is clicked, never while loading the dashboard or listing transactions. Image elements also use native lazy loading. Image object URLs are released when the preview closes or the user signs out. PDF files offer a download link. An inaccessible or deleted Drive file shows an error; no cached image fallback is used.

## Run locally

Requires Node.js 22+ and Python 3 for the static preview.

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:3000. `npm start` serves only static `out/` files. `npm run dev` is available for development.

## GitHub Pages

Repository: https://github.com/Ramasami/Expense-Tracker

The workflow deploys `out/` after pushes to `main`. GitHub Settings → Pages → Source must be **GitHub Actions**. The workflow uses the Pages-provided base path, and the app has no server endpoints. The optional repository variable `GOOGLE_CLIENT_ID` overrides the default public client ID during the build.

## Validation and limits

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
```

Tests cover login gating, approved/rejected and expired sessions, refresh without a new login, fresh sheet values after reload, failed reads/writes without local fallback, direct Google saves and readback, account text, transaction filters/sorting, receipt metadata, and lazy receipt downloads. Google requests are simulated in automated tests; they do not add financial test records to the real workbook. Legacy pure operation and storage utilities retain their unit tests, but the app does not invoke their financial storage functions.

First-time workbook setup creates recovery copies of the original ledger, tags and summaries before adding stable IDs, versions and audit metadata. Existing Type/Month array formulas are preserved; the Type formula supports explicit overrides and summaries exclude deleted records. The app's version/fingerprint checks do not provide an atomic lock across devices or manual spreadsheet edits. Concurrent writes can still race. Ledger writes are bounded to 5,000 formula rows; supporting tables are read up to 10,000 rows. Bulk operations can partially finish. Recurring schedules execute only while the app is open through Run due schedules.

The superseded backend and CLI authorization remain under ignored `work/` for recovery and are excluded from Git and static output. Do not upload `work/` or environment files.

Google references: [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
