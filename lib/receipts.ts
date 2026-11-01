import { googleToken, currentGoogleSession } from "./google-auth";
export type Receipt = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  originalSize?: number;
};
export type ReceiptProgress = {
  stage:
    | "checking"
    | "compressing"
    | "uploading"
    | "sharing"
    | "done"
    | "failed"
    | "downloading";
  loaded: number;
  total?: number;
};
type ReportProgress = (progress: ReceiptProgress) => void;
const TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export function validateReceipt(file: Pick<File, "size" | "type">) {
  if (!TYPES.has(file.type))
    throw Error("Choose JPEG, PNG, WebP images or PDF receipts.");
  const limit = file.type === "application/pdf" ? 5 : 20;
  if (file.size <= 0 || file.size > limit * 1024 * 1024)
    throw Error(`Images must be under 20 MB; PDFs must be under 5 MB.`);
}
export async function compressReceipt(file: File): Promise<File> {
  validateReceipt(file);
  if (!file.type.startsWith("image/") || file.size <= 300 * 1024) return file;
  const image = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Could not prepare this receipt image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(Error("Could not compress this receipt image.")),
        "image/webp",
        0.82,
      ),
    );
    if (compressed.type !== "image/webp" || compressed.size >= file.size)
      return file;
    return new File([compressed], file.name.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    image.close();
  }
}
class DriveRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function drive(path: string, init: RequestInit = {}, upload = false) {
  const response = await fetch(
    `https://www.googleapis.com/${upload ? "upload/" : ""}drive/v3/${path}`,
    {
      ...init,
      headers: { ...init.headers, Authorization: "Bearer " + googleToken() },
      cache: "no-store",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new DriveRequestError(
      error.error?.message ||
        (response.status === 403
          ? "Receipt access denied. Enable Google Drive API and grant file access when signing in."
          : "Google Drive did not confirm the request. Retry when your connection is available."),
      response.status,
    );
  }
  return response;
}
function validId(id: string) {
  if (!/^[\w-]+$/.test(id)) throw Error("Invalid receipt file ID.");
  return id;
}
function uploadBody(
  body: Blob,
  boundary: string,
  onProgress?: ReportProgress,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime",
    );
    xhr.setRequestHeader("Authorization", "Bearer " + googleToken());
    xhr.setRequestHeader(
      "Content-Type",
      "multipart/related; boundary=" + boundary,
    );
    xhr.responseType = "json";
    xhr.timeout = 120000;
    xhr.upload.onprogress = (event) =>
      onProgress?.({
        stage: "uploading",
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : body.size,
      });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.id)
        resolve(xhr.response);
      else
        reject(
          Error(
            xhr.response?.error?.message ||
              "Google Drive did not confirm the upload. Retry this file.",
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        Error(
          "Receipt upload failed. Check your connection and retry this file.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        Error(
          "Receipt upload timed out. Retry this file on a better connection.",
        ),
      );
    xhr.onabort = () => reject(Error("Receipt upload was cancelled."));
    onProgress?.({ stage: "uploading", loaded: 0, total: body.size });
    xhr.send(body);
  });
}
export async function uploadReceipt(
  file: File,
  transactionId: string,
  onProgress?: ReportProgress,
): Promise<Receipt> {
  validateReceipt(file);
  const originalSize = file.size;
  onProgress?.({ stage: "checking", loaded: 0 });
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
    onProgress?.({ stage: "compressing", loaded: 0 });
    file = await compressReceipt(file);
    if (file.size > 5 * 1024 * 1024)
      throw Error(
        "This image is still over 5 MB after compression. Choose a smaller image.",
      );
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
    remote = await uploadBody(body, boundary, onProgress);
  }
  const id = validId(String(remote.id || ""));
  onProgress?.({
    stage: "sharing",
    loaded: Number(remote.size || file.size),
    total: Number(remote.size || file.size),
  });
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
  onProgress?.({
    stage: "done",
    loaded: Number(remote.size || file.size),
    total: Number(remote.size || file.size),
  });
  return {
    id,
    name: String(remote.name || file.name),
    mimeType: remote.mimeType || file.type,
    size: Number(remote.size || file.size),
    originalSize,
    uploadedAt: remote.createdTime || new Date().toISOString(),
  };
}
export async function receiptBlob(
  receipt: Receipt,
  onProgress?: ReportProgress,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!TYPES.has(receipt.mimeType)) throw Error("Unsupported receipt format.");
  onProgress?.({ stage: "downloading", loaded: 0, total: receipt.size });
  const response = await drive(`files/${validId(receipt.id)}?alt=media`, {
    signal,
  });
  const type = response.headers.get("Content-Type")?.split(";")[0].trim() || "";
  if (!TYPES.has(type) || type !== receipt.mimeType)
    throw Error("Google Drive returned an unexpected receipt format.");
  const total = Number(response.headers.get("Content-Length")) || receipt.size;
  let blob: Blob;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (loaded > 5 * 1024 * 1024)
          throw Error("Receipt download exceeded 5 MB.");
        chunks.push(value as BlobPart);
        onProgress?.({ stage: "downloading", loaded, total });
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    blob = new Blob(chunks, { type });
  } else blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024)
    throw Error("Receipt download exceeded 5 MB.");
  onProgress?.({ stage: "downloading", loaded: blob.size, total: blob.size });
  return blob;
}

export async function receiptDeleteInfo(receipt: Receipt) {
  try {
    const file = await (
      await drive(
        `files/${validId(receipt.id)}?fields=id,trashed,capabilities(canTrash)`,
      )
    ).json();
    return {
      available: true,
      trashed: file.trashed === true,
      canTrash: file.capabilities?.canTrash === true,
    };
  } catch (error) {
    if (error instanceof DriveRequestError && error.status === 404)
      return { available: false, trashed: false, canTrash: false };
    throw error;
  }
}
async function setReceiptTrashed(receipt: Receipt, trashed: boolean) {
  const file = await (
    await drive(`files/${validId(receipt.id)}?fields=id,trashed`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed }),
    })
  ).json();
  if (file.id !== receipt.id || file.trashed !== trashed)
    throw Error(
      "Google Drive did not confirm the receipt file update. Retry the action.",
    );
}

export const trashReceipt = (receipt: Receipt) =>
  setReceiptTrashed(receipt, true);
export const restoreReceipt = (receipt: Receipt) =>
  setReceiptTrashed(receipt, false);
