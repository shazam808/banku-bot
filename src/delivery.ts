import { callBanku } from "./banku-api.ts";
import type { BotConfig } from "./config.ts";
import { sendDiscordDelivery } from "./discord.ts";

type Delivery = {
  id: string;
  lease_token: string;
  channel_kind: "dm" | "audit" | "fallback";
  channel_id: string | null;
  guild_id: string;
  discord_user_id: string | null;
  payload: { title?: string; body?: string; link_path?: string };
};

export async function processOutbox(config: BotConfig): Promise<void> {
  if (!config.deliveryEnabled || config.environment !== "production") return;
  const result = await callBanku(config, { action: "lease" }, 8000);
  const deliveries = Array.isArray(result.deliveries) ? result.deliveries as Delivery[] : [];
  // Keep the cron bounded; delivery attempts and lease acknowledgements are independent.
  for (const delivery of deliveries.slice(0, 10)) {
    const outcome = await sendDiscordDelivery(config, delivery);
    try {
      await callBanku(config, {
        action: "ack",
        id: delivery.id,
        lease_token: delivery.lease_token,
        outcome: outcome.outcome,
        error_code: outcome.errorCode ?? null,
        retry_seconds: outcome.retrySeconds ?? 60,
      }, 8000);
    } catch {
      // The PostgreSQL lease expires and the same message may be retried.
      // Discord does not guarantee exactly-once delivery.
      console.error("[Banku Bot] delivery acknowledgement failed", { deliveryId: delivery.id });
    }
  }
}
