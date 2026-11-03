import { Page } from "@playwright/test";
export async function mockReceiptService(
  page: Page,
  options: {
    onUpload?: (file: {
      id: string;
      name: string;
      mimeType: string;
      size: number;
      bytes: Buffer;
    }) => void;
    beforeDownload?: () => Promise<void>;
    onDownload?: () => void;
    failName?: string;
    // WebKit may omit File request bodies from its automation protocol.
    uploadBytes?: Record<string, Buffer>;
  } = {},
) {
  const files = new Map<string, any>();
  let sequence = 0;
  await page.route(
    "https://script.google.com/macros/s/**/exec",
    async (route) => {
      const req = route.request().postDataJSON();
      let result: any;
      if (req.action === "beginUpload") {
        const id = "receipt-" + ++sequence;
        files.set(id, {
          id,
          name: req.name,
          mimeType: req.mimeType,
          size: req.size,
          uploadedAt: new Date().toISOString(),
          storage: "shared-v1",
        });
        result = {
          uploadUrl:
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=" +
            id,
        };
      } else if (req.action === "finishUpload") {
        const { bytes, ...receipt } = files.get(req.id);
        result = receipt;
      } else if (req.action === "download") {
        options.onDownload?.();
        await options.beforeDownload?.();
        const file = files.get(req.id);
        result = {
          mimeType: file.mimeType,
          size: file.bytes.length,
          data: file.bytes.toString("base64"),
        };
      } else if (req.action === "info")
        result = {
          available: true,
          trashed: files.get(req.id)?.trashed === true,
          canTrash: true,
        };
      else if (req.action === "trash" || req.action === "restore") {
        const trashed = req.action === "trash";
        files.get(req.id).trashed = trashed;
        result = { id: req.id, trashed };
      } else throw Error("Unexpected service request " + req.action);
      return route.fulfill({ json: { ok: true, result } });
    },
  );
  await page.route(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=*",
    async (route) => {
      // WebKit exposes the binary PUT's CORS preflight to route handlers.
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      const id = new URL(route.request().url()).searchParams.get("upload_id")!;
      const file = files.get(id);
      if (file.name === options.failName)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Upload temporarily unavailable" } },
        });
      file.bytes =
        route.request().postDataBuffer() || options.uploadBytes?.[file.name];
      if (!file.bytes)
        throw Error(
          "The test browser omitted this upload body; provide its synthetic uploadBytes fixture.",
        );
      file.size = file.bytes.length;
      options.onUpload?.(file);
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { id },
      });
    },
  );
  return files;
}
