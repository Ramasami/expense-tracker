# Budget Tracker — AI maintainer skills

Read [README.md](README.md) for user-visible features, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow and safety boundaries, and [docs/AI_CONTEXT.generated.md](docs/AI_CONTEXT.generated.md) for the current source inventory. Follow [AGENTS.md](AGENTS.md) and local Next.js documentation before changing framework code.

## Work on this application

1. Inspect the current checkout and applicable instructions. Reuse the repository; do not create a new application or replace the stack.
2. Trace the relevant UI into the finance helpers, Google Sheet write path and Apps Script service. `lib/local-store.ts` is a validation/planning engine, not the financial source of truth.
3. Preserve owner/Sheet authorization, verified saves, exact-operation retries, optimistic concurrency and D/I array formulas. Never use stale cached data for edits.
4. Keep money/card/loan calculations in shared helpers. Do not count transfers, card settlements or loan principal as new spending twice.
5. Review document proposals before financial writes. AI analysis must not write Sheets directly, invent missing amounts/dates, or treat statement balances as purchases.
6. Keep secrets server-side. Never print or commit credentials, tokens, actual statement data, receipt bytes or any AI provider key. Use synthetic data for tests and screenshots.
7. Update README and architecture notes when behavior changes. Generated context updates automatically; it is an inventory, not a substitute for explaining a changed rule.
8. Run targeted checks, then the relevant broader checks if the change affects financial integrity, authorization or shared UI. Inspect responsive layouts when changing page structure.
9. Commit and push only within the user's authorization. Releases and Pages deployment run on pushes to main. Verify results; do not claim deployment succeeded while it is pending.

## Common tasks

| Task | Start here |
| --- | --- |
| Navigation, owner/account selection, transaction form | `app/page.tsx`, `lib/owners.ts` |
| HDFC broker holdings and per-user connection | `app/hdfc-portfolio.tsx`, `app/hdfc-settings.tsx`, `app/hdfc-connect/`, `lib/hdfc-portfolio.ts`, `apps-script/Code.gs` |
| Current balances and financial aggregation | `lib/finance.ts`, `app/account-balances.tsx` |
| Credit card purchases, partial bill settlements | `lib/credit.ts`, `app/credit-bills.tsx` |
| Loans and principal/interest splits | `lib/loans.ts`, `app/loan-tracker.tsx` |
| Duplicate review, category suggestions, cash forecasts | `lib/smart-finance.ts`, `app/duplicate-review.tsx`, `app/category-suggestion.tsx`, `app/cash-forecast.tsx` |
| Budgets, reconciliation, loan forecasts | `lib/planning.ts`, related `app/` components |
| Read-only AI financial review | `app/financial-analysis.tsx`, `lib/financial-analysis.ts`, `apps-script/Code.gs` |
| CSV/AI import preview | `app/statement-import.tsx`, `lib/statement-import.ts`, `lib/document-scanner.ts` |
| Google identity / verified session | `lib/google-auth.ts`, `lib/google-sheets.ts` |
| Receipts, shared Drive files and scanner server | `lib/receipts.ts`, `app/receipts.tsx`, `apps-script/Code.gs` |
| Offline read-only behavior | `lib/sheet-cache.ts`, `app/offline-shell.tsx`, `scripts/generate-sw.mjs` |
| Version and releases | `scripts/release-version.mjs`, `.github/workflows/` |

## Useful commands

- `npm run dev`: Next dev server plus automatic documentation watching.
- `npm run docs:sync`: regenerate the source/context inventory.
- `npm run docs:check`: fail if the committed generated context is stale.
- `npm run docs:watch`: keep the inventory current while editing outside the dev server.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser`.
- `npm run build` refreshes generated context automatically before building.
- The repository pre-commit hook regenerates/stages **only** the generated context using the staged source tree. It never stages unrelated edits.

This file is a repository playbook for AI assistants; it does not install a global Codex skill or grant access to an external service.
