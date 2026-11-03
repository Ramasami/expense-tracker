export const SESSION_SERVICE_URL =
  process.env.NEXT_PUBLIC_RECEIPT_SERVICE_URL ||
  "https://script.google.com/macros/s/AKfycbzwm_f4JiRpMDYk1yrRdCi_nhRgcQZGSM3YuC6TXOxFoSP0nYA07_PqWu-HiXadW0Yw/exec";
export async function sessionRequest(
  action: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const response = await fetch(SESSION_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ ...args, action }),
    redirect: "follow",
    cache: "no-store",
    keepalive: action === "revokeSession",
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok)
    throw new TypeError(
      "Remembered login is temporarily unavailable. Reconnect and retry.",
    );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new TypeError(
      "Remembered login is temporarily unavailable. Reconnect and retry.",
    );
  }
  if (!data || typeof data.ok !== "boolean")
    throw new TypeError(
      "Remembered login is temporarily unavailable. Reconnect and retry.",
    );
  if (!data.ok) {
    const error = Object.assign(
      new Error(data.error || "Remembered login could not complete."),
      { code: data.code },
    );
    if (data.code === "SESSION_TEMPORARY" || data.code === "SESSION_SETUP")
      throw Object.assign(new TypeError(error.message), { code: data.code });
    throw error;
  }
  return data.result;
}
