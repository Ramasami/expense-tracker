# Product and UX review — November 2026

## Shipped increments

1. **Discover changes:** Settings now has searchable version history with older milestones and commit descriptions. Details expand on demand; history works offline without a GitHub request.
2. **Understand money:** Home and Expense Analytics offer an owner/account/period AI review. Fresh numeric facts precede explicit confirmation. Tabs, category shares, expandable steps and a savings calculator support exploration without extra AI requests. Scope controls collapse after generating a report to preserve phone space.
3. **Find tasks:** Navigation groups existing screens into Everyday, Plan ahead, Understand and Manage, with an accessible current-screen marker. Home moves secondary ledger and owner-comparison cards into Cash-flow details. All-time reporting no longer presents internal sentinel dates as real dates; a single account balance uses the available width.

These changes preserve Sheet authority, authorization, audited writes and read-only offline behavior. Validation uses synthetic data and phone/desktop browser checks. This is a focused review of these flows, not a claim of usability research with real users or a complete accessibility audit.

## Next priorities for incremental validation

| Priority | User problem | Small next experiment | Success check |
| --- | --- | --- | --- |
| 1 | Import review can require reading many records | Add a compact exceptions-first review for ambiguous/duplicate rows; keep every field editable before confirmation | Fewer corrections after import; no reduction in required review or duplicate checks |
| 2 | Available cash, spending and card debt answer different questions | Test a short explanation reachable from each metric instead of more permanent text | Users can explain why a card purchase and settlement appear differently |
| 3 | Bills and budgets require navigating between screens | Prototype a small Home section for genuinely due bills and exceeded budgets, with direct links | Faster navigation to the existing payment/budget flow, no new notifications service |
| 4 | A large household can have many accounts | Test account search inside the existing selector once account count warrants it | Correct account selected quickly without expanding the default screen |
| 5 | New users may not know whether setup is complete | Test a dismissible setup checklist linking existing account/card/budget configuration | First successful verified transaction without adding extra mandatory onboarding |

Do not ship all experiments as more dashboard cards. Measure the task each increment improves; preserve collapsed advanced detail, visible labels, clear error recovery, touch targets and consistent owner/account scope. Never imply that AI investment suggestions are based on holdings valuations or live market data that the app does not have.
