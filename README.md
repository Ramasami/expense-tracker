# WealthTrack — static site with Google Sheets saves

WealthTrack remains a static GitHub Pages website. **There is no application backend or Apps Script.** Public sheet reads work without signing in. To write back to the existing workbook, the browser uses Google Identity Services and the Google Sheets API with your Google account's edit permission.

Workbook: `12AisxtgYgO2fN2tNzbzDNfX4hyAZvksyV2DtOInc5Ls`.

## Enable Google sign-in once

A **Web application OAuth client ID** must be registered in your Google Cloud project. The prior clasp CLI authorization cannot be used as a browser OAuth client. No client secret belongs in this app.

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create/select a project, and enable the **Google Sheets API**.
2. Configure **Google Auth Platform** (app branding and audience). For an external app in Testing, add only `ramasami.official@gmail.com` and `tnvarsha.99@gmail.com` as test users. Keep the app in Testing to restrict Sheets authorization to these accounts. Each account needs edit permission on the workbook.
3. Create an OAuth client with application type **Web application**. Add these **authorized JavaScript origins**:
   - `http://127.0.0.1:3000`
   - `http://localhost:3000`
   - When deployed, your GitHub Pages origin, such as `https://USERNAME.github.io` (no repository path).
4. Your supplied OAuth client ID is already configured in the app. To use a different client, open **Settings → Google Sheets saves**, paste its ID ending in `.apps.googleusercontent.com`, and click **Save client ID**.
5. Click **Sign in with Google**, choose the account that can edit the workbook, and approve the requested access. **Save destination: Google Sheets** is the default.

The ID is public configuration and the supplied ID is included by default for both local and GitHub Pages builds. To override it for every GitHub Pages visitor, set the GitHub Actions repository variable `GOOGLE_CLIENT_ID`; the supplied workflow passes it as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` during the static build. For local builds, an optional `.env.local` can contain `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`. The Settings value overrides the build value.

The supplied client ID is configured. Live sign-in still requires the matching authorized origins, Sheets API access, and the two test users in Google Cloud. Live writes remain unverified until an approved user signs in. Simulated API tests do not confirm a live connection.

References: [Google token model for browser apps](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Google OAuth client setup](https://developers.google.com/workspace/guides/create-credentials).

## What a Google save does

- Transactions are written to the original **Expense Ledger**. Tags update **Expense Tags**.
- Accounts/ledgers are written to **Accounts**. Budgets, goals, recurring schedules, holdings and settings use supporting tabs in the **same workbook**.
- On first connection, setup checks the existing headers and formulas. It creates hidden recovery copies of the ledger, tags and summary tabs in the workbook before applying metadata and summary changes in the same atomic batch. It adds stable IDs, versions, status, and operation metadata; it extends the Type array formula to respect explicit transaction types and adjusts SUMIFS summaries to exclude deleted records. The existing Month array formula and original financial values remain intact.
- Saves check the loaded record version and source fingerprint, write the financial change and **Audit Log** event in one batch, then read the result back before displaying **Saved to Google Sheets**. New records first reserve a pending row; pending rows have no financial amount and are ignored by the app until finalized.
- A failed or expired Google authorization leaves the form open. **The app never silently changes a failed Google save into a local save.** Retrying the same unchanged form reuses its operation ID. Pending row markers and audit receipts help recover lost responses.
- Google access tokens remain only in memory; they are not stored in browser storage, JSON backups, or the static export. Reloading the website or token expiration requires another sign-in. Audit actors for Google writes use the account returned by Google's user-info endpoint.

The first setup and live writes have **not been run on your real workbook** during this implementation because the Web OAuth client ID is missing.

## Browser-only records and public reading

Select **Settings → Save destination → This browser only** if you explicitly want local saves. These records use IndexedDB and remain separate from Google Sheets. Tabs on the same origin share browser data; other devices do not.

Existing browser-only records are not automatically uploaded. After signing in, use **Save to Google Sheet** on the account/tag/budget/goal card or transaction details, or open the local record and save it in Google mode. Publish referenced tags and accounts first. Locally edited sheet records can be saved by editing them in Google mode; if the source changed, review the conflict before reapplying.

Without sign-in, the app reads the public ledger/tags anonymously every 15 seconds while visible. With sign-in, refreshes read all app-managed tabs through the Sheets API. Browser cache/local overrides remain available if a read fails. Financial data is fetched at runtime and is not baked into the deployed assets.

Use **Settings → Download JSON backup** for a full browser backup and **Restore JSON backup** to move local records. Reports export CSV, Excel and PDF. Browser-only data is removed when site data is cleared. Changing origins from localhost to GitHub Pages gives a separate browser database.

## Run locally

Requires Node.js 22+ and Python 3 for the optional static preview.

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:3000. `npm start` serves only `out/` files; it has no financial API. `npm run dev` is available for development.

## Deploy to GitHub Pages

1. Push the project to your repository's `main` branch.
2. Select **Settings → Pages → Source → GitHub Actions** in GitHub.
3. Optionally configure the public repository variable `GOOGLE_CLIENT_ID`.
4. The included workflow builds and deploys only `out/`.

The workflow uses the Pages-provided base path for repository sites. For a manual project-path build, use `PAGES_BASE_PATH=/Expense_Tracker npm run build`. For root hosting, omit that variable. No GitHub repository has been created or published by this session.

## Limits of the browser-only architecture

Version/fingerprint checks can detect records changed before a save, but the Sheets API does not provide a shared compare-and-swap lock for these cell writes. Two devices that pass the checks simultaneously may still race; direct spreadsheet edits also bypass application checks. This app does **not** claim guaranteed cross-device concurrency protection or tamper-proof audit history. A shared coordinator would be needed for stronger guarantees.

Ledger writes are bounded to the original 5,000-row array/formula ranges. Reads of supporting app tables currently use up to 10,000 rows. New records over those limits require extending the integration. Bulk operations commit separately per record and can partially finish on errors. Avoid manual changes to IDs and operation metadata. Initial records without native IDs are matched by row until first setup assigns IDs.

Recurring transactions execute only while the site is open through **Run due schedules**, in the selected save destination. No schedules run while the site is closed. Investment figures are contributions, not market values. Cash movement = income − expenses − investment contributions. Savings rate = (income − expenses) / income. Transfers conserve household cash.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
```

Tests cover browser persistence, direct Sheets requests, ledger/account writes, readback, response-loss retries, stale versions, setup recovery copies, array-formula preservation, Google sign-in UI using a simulated Google API, and signed-out save failures without local fallback. They do not write test financial records into your real workbook.

The superseded backend and prior local CLI credentials remain under ignored `work/` for recovery. Neither is included in the static build or GitHub Pages artifact. Do not upload `work/` or hidden environment files manually.

## Approved Google accounts

The app accepts only verified Google profiles for `ramasami.official@gmail.com` and `tnvarsha.99@gmail.com`. Other accounts are rejected before any authenticated Sheets requests or workbook setup. This browser check is a convenience guard, not a security boundary: enforce access with Google's test-user list and workbook sharing permissions. A static GitHub Pages site remains public, and anonymous reads still expose any publicly shared workbook data. Changing workbook sharing to Restricted also requires signed-in reads; anonymous imports will stop.
# Expense-Tracker
# Expense-Tracker
# Expense-Tracker
# Expense-Tracker
