# Budget Tracker

A static GitHub Pages app for Ram and Varsha. Google Sheets is the sole source of financial records; Google Drive holds uploaded bills and receipts. There is no application backend or Apps Script.

## Access and sessions

The first screen requires Google sign-in. Only verified profiles for `ramasami.official@gmail.com` and `tnvarsha.99@gmail.com` are accepted. The supplied public Web OAuth client ID is configured by default; no client secret is included in the site.

A short-lived Google access token and its expiry are saved in `localStorage` on this device, so refreshing, closing and reopening the phone's installed Chrome app does not open another login prompt while the token is valid. When online, the app verifies that token and the approved account with Google before fetching the workbook. Offline behavior is described below. The session ends on sign-out, Google token expiry, or clearing site data. Closing the tab or installed app does not end a valid saved session. Expired tokens require sign-in again; this static app does not store refresh tokens. Local storage is readable by scripts on this origin, so treat it as a short-lived browser credential. Neither session credentials nor receipt bytes are included in exports.

In Google Cloud, enable **Google Sheets API** and **Google Drive API**. Keep the OAuth app External / Testing with only the two approved emails as test users. Add these authorized JavaScript origins to the Web application client:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `https://ramasami.github.io`

Redirect URIs are not needed for this popup token flow. The app requests `spreadsheets`, `drive.file`, `openid`, email and profile scopes. Users must approve file access for receipt uploads. An optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID` build variable or Settings client ID can override the default.

**Workbook permissions enforce data privacy.** GitHub Pages serves public application files, and client-side checks alone cannot protect a publicly shared spreadsheet. Set the workbook's General access to **Restricted** and grant editor access only to the two approved accounts. The app uses authenticated Sheets requests, so it does not need a public workbook. Keep the Google test-user list restricted too.

## Data behavior

Workbook: `12AisxtgYgO2fN2tNzbzDNfX4hyAZvksyV2DtOInc5Ls`.

After Google login, the app reads a validated, per-account IndexedDB cache of the last confirmed Sheet records, then syncs the visible screen. Google Sheets remains authoritative: there are no offline financial writes, speculative saves or merges with the superseded browser-only database. A stale/offline banner shows the last sync time; edits, uploads and deletions are disabled until a fresh Sheet read succeeds. Failed requests keep the explicitly marked cached view. A screen that has never been fetched shows an unavailable message rather than invented empty records.

Pull down at the top of the screen, use **Refresh data**, or press **Sync now** to force a refresh. Startup and reconnect refresh the current screen. Recently fetched screens are reused for 60 seconds; navigation fetches missing/older required collections only. There is no 15-second Sheets polling. Sheet properties are briefly memoized; required ranges are read together in one `values:batchGet` request. Dashboard/transactions read ledger, tags and accounts; supporting tables and audit history are loaded only when their screens or transaction details need them. Saves still perform the version/idempotency checks and server readback needed for integrity.

The static app shell is cached by a versioned service worker after the first successful online load. Closing and reopening the phone app offline works once that installation and a Sheet sync have completed. With an unexpired token and a previously Google-verified approved profile, offline startup unlocks only that account's cached data. Google cannot check revocation while offline; cached access ends when the token expires or the user signs out. Reconnecting revalidates the token with Google and syncs before enabling edits. An expired/unverified login still requires an online sign-in. Google API responses, credentials and receipt file bytes are never stored in the service worker cache. New receipt previews require a connection; financial records already synced can be read offline.

Only confirmed Google reads/writes update the financial cache. A failed save never silently becomes a local save. JSON exports fetch a fresh Sheet snapshot; reports can export the currently displayed view, including clearly marked cached data. Local backup restore is disabled.

Transactions write to **Expense Ledger**; tags come only from **Expense Tags**. Historical ledger categories missing from that list remain readable but are not offered as new tags. From account and To account are text inputs. Entering an existing managed account's name links its ID for balance calculations; other names remain free text. Transfers require two different accounts.

Transactions support dedicated search, date and person filters, tag/type/account/payment/receipt filters, minimum/maximum amounts, and date/amount/merchant sorting. Account filtering matches both the source and destination. Reset clears the transaction filters and returns to All Time / Combined.

The dashboard opens in **All Time** and shows **Total savings = income − expenses**, including money contributed to investments. Net cash movement additionally subtracts investment contributions. Transfers do not inflate income or expenses.

## Bills and receipts

Save a transaction, then click its merchant/description to open the detail panel. Select multiple JPEG, PNG, WebP or PDF files at once, up to **20 attachments per transaction**. Input images can be up to **20 MB**; PDFs must be under **5 MB**. Photos larger than 300 KB are resized to a maximum edge of 2048 pixels and encoded as WebP at quality 0.82 when that makes them smaller. Files uploaded to Drive are capped at 5 MB. Small images and PDFs are left unchanged. Browsers decode compressed images automatically when opened; there is no separate unzip step. Compression reduces file size with some image-detail loss; keep your originals if needed.

Files are uploaded directly to the signed-in user's Google Drive and shared as reader with the other approved account; no public file link is created. Metadata and Drive IDs are saved in the transaction's `receipts` column (**W**) in Expense Ledger. The app adds this column to an existing compatible ledger without changing the financial cells or array formulas. Two uploads run at a time, followed by one Sheets save for the batch. Failed files are reported individually; successful uploads are linked to the transaction, and failed files can be retried. Compression savings are displayed after upload. Per-file progress bars show preparation, actual upload bytes, sharing and completion; opening a receipt shows download byte progress, with cancellation when the preview closes. Content hashes of the original file allow retries of the same transaction/file upload to reuse existing files. A file upload and the Sheet link are separate Google operations: if linking fails, retry the same file after reconnecting to complete the link. A file may remain in Drive if linking is abandoned.

Receipt images and PDF bytes are fetched only when **View** is clicked, never while loading the dashboard or listing transactions. Image elements also use native lazy loading. Image object URLs are released when the preview closes or the user signs out. PDF files offer a download link. An inaccessible or deleted Drive file shows an error; no cached image fallback is used.

Use **Delete** beside a bill or receipt to confirm deletion of the actual Drive file and its transaction link. The app verifies Drive trash permission, moves the file to **Google Drive Trash**, confirms that result, and then saves the link removal and audit in Sheets. If the signed-in account cannot trash the file, deletion is blocked and nothing is unlinked; sign in with the uploader/owner. A failed Drive request leaves the transaction link intact. If the Sheet update fails, the app attempts to restore the file from Trash and reports the outcome; sync and retry to reconcile any partial result. Success is shown only when both Drive and Sheets confirm. The app never permanently deletes files. Drive's normal Trash retention applies; restoring a file manually does not automatically restore its transaction link.

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

Tests cover login gating, approved/rejected and expired sessions, refresh without a new login, fresh sheet values after reload, read-only cached views on failed reads/writes, offline relaunch, pull-to-refresh, selective range reads and Drive receipt deletion with rollback, direct Google saves and readback, account text, transaction filters/sorting, receipt metadata, and lazy receipt downloads. Google requests are simulated in automated tests; they do not add financial test records to the real workbook. Legacy pure operation and storage utilities retain their unit tests, but the app does not invoke their financial storage functions.

First-time workbook setup creates recovery copies of the original ledger, tags and summaries before adding stable IDs, versions and audit metadata. Existing Type/Month array formulas are preserved; the Type formula supports explicit overrides and summaries exclude deleted records. The app's version/fingerprint checks do not provide an atomic lock across devices or manual spreadsheet edits. Concurrent writes can still race. Ledger writes are bounded to 5,000 formula rows; supporting tables are read up to 10,000 rows. Bulk operations can partially finish. Recurring schedules execute only while the app is open through Run due schedules.

The superseded backend and CLI authorization remain under ignored `work/` for recovery and are excluded from Git and static output. Do not upload `work/` or environment files.

Google references: [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
