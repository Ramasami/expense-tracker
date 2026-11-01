import { googleToken, currentGoogleSession } from "./google-auth";
export type Receipt = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};
const TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export function validateReceipt(file: Pick<File, "size" | "type">) {
  if (!TYPES.has(file.type))
    throw Error("Choose a JPEG, PNG, WebP image or PDF receipt.");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw Error("Receipts must be between 1 byte and 5 MB.");
}
async function drive(path: string, init: RequestInit = {}, upload = false) {
  const response = await fetch(
    `https://www.googleapis.com/${upload ? "upload/" : ""}drive/v3/${path}`,
    {
      ...init,
      headers: { ...init.headers, Authorization: "Bearer " + googleToken() },
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(
      error.error?.message ||
        (response.status === 403
          ? "Receipt access denied. Enable Google Drive API and grant file access when signing in."
          : "Google Drive did not confirm the request. Retry when your connection is available."),
    );
  }
  return response;
}
function validId(id: string) {
  if (!/^[\w-]+$/.test(id)) throw Error("Invalid receipt file ID.");
  return id;
}
export async function uploadReceipt(
  file: File,
  transactionId: string,
): Promise<Receipt> {
  validateReceipt(file);
  const actor = currentGoogleSession()?.email;
  if (!actor) throw Error("Sign in before uploading receipts.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const hash = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const key = transactionId.replace(/[^\w-]/g, "_") + "-" + hash;
  // A retry reuses the same uploaded bytes instead of creating duplicate files.
  const params = new URLSearchParams({
    q: `trashed = false and appProperties has { key='budgetReceipt' and value='${key}' }`,
    fields: "files(id,name,mimeType,size,createdTime)",
    pageSize: "1",
  });
  let remote = (await (await drive("files?" + params)).json()).files?.[0];
  if (!remote) {
    const boundary = "budget_receipt_" + crypto.randomUUID();
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({
        name: file.name,
        mimeType: file.type,
        appProperties: { budgetReceipt: key },
      }),
      `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
      file,
      `\r\n--${boundary}--\r\n`,
    ]);
    remote = await (
      await drive(
        "files?uploadType=multipart&fields=id,name,mimeType,size,createdTime",
        {
          method: "POST",
          headers: {
            "Content-Type": "multipart/related; boundary=" + boundary,
          },
          body,
        },
        true,
      )
    ).json();
  }
  const id = validId(String(remote.id || ""));
  const other =
    actor === "ramasami.official@gmail.com"
      ? "tnvarsha.99@gmail.com"
      : "ramasami.official@gmail.com";
  const permissions = await (
    await drive(`files/${id}/permissions?fields=permissions(emailAddress,role)`)
  ).json();
  if (
    !permissions.permissions?.some(
      (p: any) => p.emailAddress?.toLowerCase() === other,
    )
  ) {
    await drive(`files/${id}/permissions?sendNotificationEmail=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "user",
        role: "reader",
        emailAddress: other,
      }),
    });
  }
  return {
    id,
    name: String(remote.name || file.name),
    mimeType: file.type,
    size: Number(remote.size || file.size),
    uploadedAt: remote.createdTime || new Date().toISOString(),
  };
}
export async function receiptBlob(receipt: Receipt): Promise<Blob> {
  if (!TYPES.has(receipt.mimeType)) throw Error("Unsupported receipt format.");
  const response = await drive(`files/${validId(receipt.id)}?alt=media`);
  const blob = await response.blob();
  if (
    !TYPES.has(blob.type) ||
    blob.type !== receipt.mimeType ||
    blob.size > 5 * 1024 * 1024
  )
    throw Error("Google Drive returned an unexpected receipt format or size.");
  return blob;
}
