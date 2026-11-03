import { z } from "zod";
import { aiService } from "./document-scanner";
const holding = z.object({
  name: z.string().max(200),
  isin: z.string().max(40),
  exchange: z.string().max(20),
  sector: z.string().max(120),
  quantity: z.number().finite().nonnegative(),
  averagePrice: z.number().finite().nonnegative().nullable(),
  closePrice: z.number().finite().nonnegative().nullable(),
  investedValue: z.number().finite().nonnegative().nullable(),
  closingValue: z.number().finite().nonnegative().nullable(),
  unrealized: z.number().finite().nullable(),
});
export const hdfcStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  clientHint: z.string(),
  connectedAt: z.string().nullable(),
});
export const hdfcPortfolioSchema = z.object({
  status: hdfcStatusSchema,
  holdings: z.array(holding).max(2000),
  fetchedAt: z.string().nullable(),
});
export type HDFCStatus = z.infer<typeof hdfcStatusSchema>;
export type HDFCPortfolio = z.infer<typeof hdfcPortfolioSchema>;
export type HDFCHolding = z.infer<typeof holding>;
export const HDFC_FLOW_KEY = "budget-hdfc-pending-flow";
export async function hdfcStatus() {
  return hdfcStatusSchema.parse(await aiService("hdfcStatus"));
}
export async function saveHDFC(
  apiKey: string,
  apiSecret: string,
  clientId: string,
) {
  return hdfcStatusSchema.parse(
    await aiService("configureHDFC", {
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      clientId: clientId.trim(),
    }),
  );
}
export async function startHDFC() {
  const result = z
    .object({ loginUrl: z.string().url(), flowId: z.string().min(16).max(100) })
    .parse(await aiService("beginHDFC"));
  const url = new URL(result.loginUrl);
  if (
    url.origin !== "https://developer.hdfcsec.com" ||
    url.pathname !== "/oapi/v1/login" ||
    url.username ||
    url.password
  )
    throw Error("Invalid HDFC sign-in URL.");
  sessionStorage.setItem(HDFC_FLOW_KEY, result.flowId);
  return result.loginUrl;
}
export async function finishHDFC(requestToken: string, flowId: string) {
  return hdfcStatusSchema.parse(
    await aiService("completeHDFC", { requestToken, flowId, confirmed: true }),
  );
}
export async function disconnectHDFC() {
  return hdfcStatusSchema.parse(
    await aiService("disconnectHDFC", { confirmed: true }),
  );
}
export async function fetchHDFCPortfolio() {
  return hdfcPortfolioSchema.parse(await aiService("hdfcPortfolio"));
}
export function portfolioTotals(rows: HDFCHolding[]) {
  const sum = (field: "investedValue" | "closingValue" | "unrealized") =>
    Math.round(rows.reduce((a, r) => a + (r[field] ?? 0), 0) * 100) / 100;
  return {
    invested: sum("investedValue"),
    value: sum("closingValue"),
    gain: sum("unrealized"),
    partialCost: rows.some((r) => r.investedValue === null),
    partialValue: rows.some((r) => r.closingValue === null),
    partialGain: rows.some((r) => r.unrealized === null),
  };
}

export async function pendingHDFC() {
  return z
    .object({ flowId: z.string().min(16).max(100).nullable() })
    .parse(await aiService("pendingHDFC"));
}
