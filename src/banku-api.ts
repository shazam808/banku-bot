import { signBankuRequest } from "./crypto.ts";
import type { BotConfig } from "./config.ts";

export async function callBanku(
  config: BotConfig,
  request: Record<string, unknown>,
  timeoutMs = 2500,
): Promise<Record<string, unknown>> {
  if (!config.bankuApiUrl.startsWith("https://") || config.bankuServiceSecret.length < 32) {
    throw new Error("banku_api_not_configured");
  }
  const url = new URL("/api/bot/v1", config.bankuApiUrl);
  const body = JSON.stringify(request);
  const nonce = crypto.randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signBankuRequest(config.bankuServiceSecret, body, nonce, timestamp);
  const response = await fetch(url, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      "x-banku-timestamp": timestamp,
      "x-banku-nonce": nonce,
      "x-banku-signature": signature,
    },
  });
  if (!response.ok) throw new Error(`banku_api_${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("banku_api_invalid");
  }
  return data as Record<string, unknown>;
}
