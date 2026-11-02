# Shared receipt service

Project: https://script.google.com/home/projects/175q3amnRU4HHfmogHaJN7eKwFqxSivLn_ACf6Dp4uZbCJHGZRTM5P2Qu/edit

Deploy `Code.gs` and `appsscript.json` as a web app **executing as Ram**, accessible to anyone at the transport layer. Every POST independently validates a live Google access token issued to Budget Tracker’s Web client and a verified email assigned to an active owner in the Budget Sheet, and confirms the caller’s own Sheet access. Anonymous requests cannot operate on files. GET returns only a public health marker. No frontend shared secret or owner access token is used.

Run `setup` once as Ram and authorize the script. It creates a dedicated private receipt folder and grants Varsha view access. The service can trash/restore folder files on behalf of an authenticated, Sheet-authorized owner. New owners use the authenticated service for previews; they do not receive public Drive file links or automatic folder-sharing grants. Google requests broad Drive permission for this owner script; code limits operations to the stored folder ID and service marker. Do not share the Apps Script project with other editors.

Upload: authenticated `beginUpload` creates a scoped resumable session; browser uploads bytes directly to Google Drive with byte progress; authenticated `finishUpload` verifies size, MIME, folder and marker. Content hashes reuse completed uploads on retry. Incomplete upload sessions expire at Google; retrying an interrupted session may create another pending session. Completed files whose Sheet linking was abandoned stay in Drive until explicitly cleaned up.

Deletion: authenticated `info` and `trash`, then the app removes the Sheet link. If Sheets fails, authenticated `restore` attempts rollback. No permanent deletion endpoint exists. Files retain normal Drive Trash retention. Download returns base64 only after authentication and folder validation; frontend requests it lazily and shows transport download progress. No receipt bytes are cached offline.

Older direct uploads are not owned by the service. They remain readable with their existing permissions and retain uploader-only deletion. Replace them with a shared upload, then have the original uploader delete the original attachment. The service does not silently create a replacement and leave an undeleted original.

After changes, update the project source, create a new version and update the existing deployment to that version. Its URL remains stable. The public endpoint is the default in `lib/receipts.ts` and can be overridden at build time with `NEXT_PUBLIC_RECEIPT_SERVICE_URL`. Apps Script quotas and execution limits apply; receipt controls require connectivity and a valid Google session.
