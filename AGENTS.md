<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Budget Tracker maintenance

Read `skills.MD`, `docs/ARCHITECTURE.md` and `docs/AI_CONTEXT.generated.md` before changing this app. Preserve Sheet authority, owner authorization, D/I formulas, verified saves, exact-operation retries and offline read-only behavior. Use synthetic data for tests and screenshots; never read/print/commit credentials or real receipt/statement data.

For every behavioral or workflow change, update the relevant README and architecture sections in the same change. Do not hand-edit generated context: run `npm run docs:sync` (the dev watcher, pre-build and pre-commit hooks also refresh it). CI runs `npm run docs:check`. Keep the repository hooks installed via `npm run hooks:install`; do not overwrite a user's different hook configuration. The pre-commit hook stages only generated documentation from the staged tree.

Verify changed layouts on desktop and phone. Check browser behavior when altering shared controls, dialogs or imports. Test financial/authorization/integrity paths meaningfully. Confirm push, deployment and release results before reporting them complete.
