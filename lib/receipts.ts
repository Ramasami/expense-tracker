import { googleToken, currentGoogleSession } from "./google-auth";
export type Receipt = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  originalSize?: number;
  storage?: "shared-v1";
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
export const RECEIPT_SERVICE_URL =
  process.env.NEXT_PUBLIC_RECEIPT_SERVICE_URL ||
  "https://script.google.com/macros/s/AKfycbzwm_f4JiRpMDYk1yrRdCi_nhRgcQZGSM3YuC6TXOxFoSP0nYA07_PqWu-HiXadW0Yw/exec";
async function receiptService(
  action: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: ReportProgress,
): Promise<any> {
  if (!RECEIPT_SERVICE_URL)
    throw Error("Shared receipt storage has not been configured yet.");
  const response = await fetch(RECEIPT_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ ...args, action, token: googleToken() }),
    cache: "no-store",
    redirect: "follow",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
      : AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw Error("Shared receipt service is unavailable. Retry when connected.");
  let text = "";
  if (response.body && onProgress) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let loaded = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        loaded += part.value.byteLength;
        if (loaded > 8 * 1024 * 1024)
          throw Error("Receipt response exceeded its size limit.");
        text += decoder.decode(part.value, { stream: true });
        onProgress({
          stage: "downloading",
          loaded,
          total: Number(response.headers.get("Content-Length")) || undefined,
        });
      }
      text += decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  } else text = await response.text();
  const result = JSON.parse(text);
  if (!result.ok)
    throw Error(
      result.error || "The shared receipt operation was not confirmed.",
    );
  return result.result;
}
function uploadShared(
  file: File,
  url: string,
  onProgress?: ReportProgress,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.responseType = "json";
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) =>
      onProgress?.({
        stage: "uploading",
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : file.size,
      });
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 && xhr.response?.id
        ? resolve(xhr.response)
        : reject(
            Error("Google Drive did not confirm the upload. Retry this file."),
          );
    xhr.onerror = () =>
      reject(Error("Receipt upload failed. Check your connection and retry."));
    xhr.ontimeout = () =>
      reject(Error("Receipt upload timed out. Retry this file."));
    xhr.onabort = () => reject(Error("Receipt upload was cancelled."));
    onProgress?.({ stage: "uploading", loaded: 0, total: file.size });
    xhr.send(file);
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
  onProgress?.({ stage: "compressing", loaded: 0 });
  file = await compressReceipt(file);
  if (file.size > 5 * 1024 * 1024)
    throw Error(
      "This image is still over 5 MB after compression. Choose a smaller image.",
    );
  const prepared = await receiptService("beginUpload", {
    key,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    origin: location.origin,
  });
  let receipt = prepared.receipt;
  if (!receipt) {
    const url = String(prepared.uploadUrl || "");
    if (!/^https:\/\/www\.googleapis\.com\/upload\//.test(url))
      throw Error("Invalid shared upload session.");
    const uploaded = await uploadShared(file, url, onProgress);
    onProgress?.({ stage: "sharing", loaded: file.size, total: file.size });
    receipt = await receiptService("finishUpload", {
      id: validId(uploaded.id),
    });
  }
  onProgress?.({ stage: "done", loaded: receipt.size, total: receipt.size });
  return { ...receipt, originalSize };
}

export async function receiptBlob(
  receipt: Receipt,
  onProgress?: ReportProgress,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!TYPES.has(receipt.mimeType)) throw Error("Unsupported receipt format.");
  if (receipt.storage === "shared-v1") {
    onProgress?.({ stage: "downloading", loaded: 0 });
    const result = await receiptService(
      "download",
      { id: validId(receipt.id) },
      signal,
      onProgress,
    );
    if (
      result.mimeType !== receipt.mimeType ||
      result.size > 5 * 1024 * 1024 ||
      typeof result.data !== "string" ||
      result.data.length > 7 * 1024 * 1024
    )
      throw Error("Invalid receipt response.");
    const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
    if (bytes.length !== result.size)
      throw Error("Incomplete receipt download.");
    onProgress?.({
      stage: "downloading",
      loaded: bytes.length,
      total: bytes.length,
    });
    return new Blob([bytes], { type: result.mimeType });
  }
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
  if (receipt.storage === "shared-v1")
    return receiptService("info", { id: validId(receipt.id) });
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
  if (receipt.storage === "shared-v1") {
    const result = await receiptService(trashed ? "trash" : "restore", {
      id: validId(receipt.id),
    });
    if (result.id !== receipt.id || result.trashed !== trashed)
      throw Error("Shared Drive file update was not confirmed.");
    return;
  }
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
