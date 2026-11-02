import { AI_PROVIDERS, type AIProvider } from "./ai-providers";
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
export const scanDocumentSchema = z.object({
  sourceIndex: z.number().int().min(0).max(4),
  statementKind: z.enum(["Bank", "CreditCard", "Receipt", "Mixed", "Unknown"]),
  dateFormat: z.enum(["DMY", "MDY", "YMD", "Unknown"]),
  creditCardHint: z.string().max(200).nullable(),
});
export type ScanHints = {
  statementKind: "Auto" | "Bank" | "CreditCard" | "Receipt";
  dateFormat: "Auto" | "DMY" | "MDY" | "YMD";
  creditCardName?: string;
};
export const scanSchema = z.object({
  documents: z.array(scanDocumentSchema).max(5).default([]),
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
  provider?: AIProvider;
  providers?: { provider: AIProvider; configured: boolean }[];
  configured: boolean;
  canConfigure?: boolean;
  model: string;
}> {
  return service("scannerStatus");
}
export async function saveScannerKey(
  apiKey: string,
  provider?: AIProvider,
): ReturnType<typeof scannerStatus> {
  return service("configureScanner", { apiKey, provider });
}
export async function selectScannerProvider(
  provider: AIProvider,
): ReturnType<typeof scannerStatus> {
  return service("selectScannerProvider", { provider });
}
export async function testScannerKey(provider?: AIProvider): Promise<{
  ok: boolean;
  model: string;
  testedAt: string;
}> {
  return service("testScannerKey", { provider });
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
  hints?: ScanHints,
  provider?: AIProvider,
) {
  if (!files.length || files.length > 5)
    throw Error("Select between 1 and 5 images or PDFs.");
  onStage("Checking scanner setup…");
  const setup =
    configured === undefined ? await scannerStatus() : { configured, provider };
  const ready = setup.configured;
  const selectedProvider = setup.provider || provider;
  if (!ready)
    throw Error(
      "AI scanning is not configured yet. Ask the service owner to select an AI provider and add its API key in Settings → AI bill & statement scanner.",
    );
  if (
    selectedProvider === "groq" &&
    (files.length > 3 || files.some((file) => file.type === "application/pdf"))
  )
    throw Error(
      "Groq supports up to 3 images per scan. Upload screenshots, or select OpenAI/Gemini for PDFs.",
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
  onStage(
    `Analyzing documents with ${AI_PROVIDERS[selectedProvider || "openai"].name}…`,
  );
  const result = scanSchema.parse(
    await service("analyzeDocuments", {
      provider: selectedProvider,
      files: documents,
      hints,
      tags: tags
        .filter((t) => t.status === "Active")
        .slice(0, 300)
        .map((t) => ({ id: t.id, name: t.name, type: t.type })),
    }),
  );
  return result;
}

// A detected issuer alone must not select one of several cards silently.
export function matchScannedCard(
  hint: string | null | undefined,
  cards: { id: string; name: string }[],
): string {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const value = normalize(hint || "");
  if (!value) return "";
  const matches = cards.filter((card) => {
    const name = normalize(card.name);
    return name === value || (name.length >= 4 && value.includes(name));
  });
  return matches.length === 1 ? matches[0].id : "";
}
