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
  const deadline = Date.now() + 45000;
  for (let i = 0; i < 5 && Date.now() < deadline; i++) {
    const result = await callBanku(config, { action: "lease", single: true }, 8000);
    if (!Array.isArray(result.deliveries) || !result.deliveries.length) return;
    // An older server may lease a batch. Complete it before asking for more.
    for (const delivery of result.deliveries as Delivery[]) {
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
        console.log("[Banku Bot] delivery", {
          id: delivery.id,
          kind: delivery.channel_kind,
          outcome: outcome.outcome,
          code: outcome.errorCode,
        });
      } catch {
        // The PostgreSQL lease expires and the same message may be retried.
        // Discord does not guarantee exactly-once delivery.
        console.error("[Banku Bot] delivery acknowledgement failed", { deliveryId: delivery.id });
        return;
      }
      if (outcome.errorCode === "discord_429") return;
    }
  }
}
