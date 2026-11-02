# Shared receipt service

Project: https://script.google.com/home/projects/175q3amnRU4HHfmogHaJN7eKwFqxSivLn_ACf6Dp4uZbCJHGZRTM5P2Qu/edit

Deploy `Code.gs` and `appsscript.json` as a web app **executing as Ram**, accessible to anyone at the transport layer. Every POST independently validates a live Google access token issued to Budget Tracker’s Web client and a verified email assigned to an active owner in the Budget Sheet, and confirms the caller’s own Sheet access. Anonymous requests cannot operate on files. GET returns only a public health marker. No frontend shared secret or owner access token is used.

Run `setup` once as Ram and authorize the script. It creates a dedicated private receipt folder and grants Varsha view access. The service can trash/restore folder files on behalf of an authenticated, Sheet-authorized owner. New owners use the authenticated service for previews; they do not receive public Drive file links or automatic folder-sharing grants. Google requests broad Drive permission for this owner script; code limits operations to the stored folder ID and service marker. Do not share the Apps Script project with other editors.

Upload: authenticated `beginUpload` creates a scoped resumable session; browser uploads bytes directly to Google Drive with byte progress; authenticated `finishUpload` verifies size, MIME, folder and marker. Content hashes reuse completed uploads on retry. Incomplete upload sessions expire at Google; retrying an interrupted session may create another pending session. Completed files whose Sheet linking was abandoned stay in Drive until explicitly cleaned up.

Deletion: authenticated `info` and `trash`, then the app removes the Sheet link. If Sheets fails, authenticated `restore` attempts rollback. No permanent deletion endpoint exists. Files retain normal Drive Trash retention. Download returns base64 only after authentication and folder validation; frontend requests it lazily and shows transport download progress. No receipt bytes are cached offline.

Older direct uploads are not owned by the service. They remain readable with their existing permissions and retain uploader-only deletion. Replace them with a shared upload, then have the original uploader delete the original attachment. The service does not silently create a replacement and leave an undeleted original.

After changes, update the project source, create a new version and update the existing deployment to that version. Its URL remains stable. The public endpoint is the default in `lib/receipts.ts` and can be overridden at build time with `NEXT_PUBLIC_RECEIPT_SERVICE_URL`. Apps Script quotas and execution limits apply; receipt controls require connectivity and a valid Google session.

## Optional OpenAI document scanner

The same authenticated service now supports `scannerStatus` and `analyzeDocuments`. Both require the caller’s verified app token, active owner mapping and Sheet access. The analysis action returns proposals only; it never writes transactions, invokes model tools or changes Drive files.

In **Project Settings → Script properties**, configure:

- `OPENAI_API_KEY`: server-only OpenAI project key. Never put it in the browser, `.env` public variables, Git or chat.
- `OPENAI_MODEL` (optional): default `gpt-4.1-mini`; use a model supporting Responses, image/PDF inputs and strict structured outputs.

Requests use `https://api.openai.com/v1/responses`, `store:false`, a strict JSON schema and no tools. Existing `script.external_request` scope is sufficient. Only selected documents and sanitized active tag identifiers/names/types are forwarded; the caller’s Google token, owner email and full ledger are not forwarded. Applicable OpenAI API billing/data policies still apply. The scanner returns a clear setup message until the key is configured. This is a one-time setup: Script properties survive app refreshes, sign-outs, other devices and deployments. Once detected, the website shows **Configured** and hides key setup instructions. Only deleting or replacing the property changes the saved key.

Limits: 1–5 files, each up to 2 MB decoded, 4 MB decoded total, at most 100 extracted transactions and 20 analyses per owner/day. Image/PDF MIME types, data-URL encoding and payload sizes are checked before calling OpenAI. Large scans do not hold the receipt service lock during the model request; the short lock only updates quota counters. Provider failures are sanitized and do not expose keys or raw provider output. API extraction never automatically retries or writes financial data.

The website shows editable proposals, duplicate/uncertainty warnings and a mandatory final confirmation. Only the normal client-to-Sheets audited save path imports selected records. Updating this source requires creating a new Apps Script version and updating the existing deployment; do not create a second public frontend secret. Tests cover proposal-only behavior, missing-key handling, quotas, provider errors and shared-receipt authorization.


`configureScanner` accepts an OpenAI key from the authenticated Settings password field, saves it only as `OPENAI_API_KEY` in Script properties, and returns configuration status without the key. This action additionally requires Ram’s service-owner email; other active owners cannot overwrite a shared paid credential. It validates the key format, locks the property update and never writes financial data. Empty/invalid submissions preserve the existing key. Use a Restricted project key with Responses Write permission (no Files permission is needed for inline inputs); Read-only is insufficient. Saving does not incur an OpenAI request or validate provider billing. The input is cleared after submission and never enters browser persistence, Sheet backups or model prompts.
