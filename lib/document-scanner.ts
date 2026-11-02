import { z } from "zod";
import { googleToken } from "./google-auth";
import { compressReceipt, RECEIPT_SERVICE_URL } from "./receipts";
import type { RecordData } from "./finance";
export const scanRowSchema = z.object({
  date: z.string().nullable(),
  description: z.string().max(300),
  amount: z.number().positive().nullable(),
  type: z.enum(["Expense", "Income", "Investment", "Transfer", "Unknown"]),
  expenseMode: z.enum(["Debit", "Credit", "Unknown"]),
  kind: z.enum([
    "purchase",
    "income",
    "refund",
    "transfer",
    "card_payment",
    "loan_payment",
    "unknown",
  ]),
  tagId: z.string().nullable(),
  accountHint: z.string().nullable(),
  toAccountHint: z.string().nullable(),
  creditCardHint: z.string().nullable(),
  currency: z.enum(["INR", "Other", "Unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  sourceIndex: z.number().int().min(0).max(4),
  notes: z.string().max(1000),
});
export const scanSchema = z.object({
  transactions: z.array(scanRowSchema).max(100),
  warnings: z.array(z.string().max(1000)).max(20),
});
export type ScannedRow = z.infer<typeof scanRowSchema>;
async function service(action: string, args: Record<string, unknown> = {}) {
  const response = await fetch(RECEIPT_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ ...args, action, token: googleToken() }),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok)
    throw Error(
      "The scanner service is unavailable. Try again when connected.",
    );
  const data = await response.json();
  if (!data.ok) throw Error(data.error || "Document analysis failed.");
  return data.result;
}
export async function scannerStatus(): Promise<{
  configured: boolean;
  model: string;
}> {
  return service("scannerStatus");
}
function dataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(Error("Could not read the selected document."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
export async function analyzeDocuments(
  files: File[],
  tags: RecordData[],
  onStage: (message: string) => void,
  configured?: boolean,
) {
  if (!files.length || files.length > 5)
    throw Error("Select between 1 and 5 images or PDFs.");
  onStage("Checking scanner setup…");
  const ready = configured ?? (await scannerStatus()).configured;
  if (!ready)
    throw Error(
      "AI scanning is not configured yet. Add OPENAI_API_KEY in the Apps Script project’s Script properties; never enter it in the website.",
    );
  const documents: { name: string; mimeType: string; data: string }[] = [];
  let total = 0;
  for (const [index, file] of files.entries()) {
    onStage(`Preparing document ${index + 1} of ${files.length}…`);
    const prepared = await compressReceipt(file);
    if (prepared.size > 2 * 1024 * 1024)
      throw Error(
        "Each scan must be under 2 MB after compression. Split large PDFs into smaller files.",
      );
    total += prepared.size;
    if (total > 4 * 1024 * 1024)
      throw Error(
        "Scan up to 4 MB of documents at a time after image compression.",
      );
    documents.push({
      name: prepared.name.slice(0, 200),
      mimeType: prepared.type,
      data: await dataURL(prepared),
    });
  }
  onStage("Analyzing documents with OpenAI…");
  const result = scanSchema.parse(
    await service("analyzeDocuments", {
      files: documents,
      tags: tags
        .filter((t) => t.status === "Active")
        .slice(0, 300)
        .map((t) => ({ id: t.id, name: t.name, type: t.type })),
    }),
  );
  return result;
}
