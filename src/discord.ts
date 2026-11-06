import type { BotConfig } from "./config.ts";
import { auditIsPrivate, type Channel, staffRoles } from "./channel-policy.ts";

export type SendResult = {
  outcome: "delivered" | "retry" | "permanent" | "dm_forbidden";
  errorCode?: string;
  retrySeconds?: number;
};

const ID = /^\d{15,22}$/;
const base = "https://discord.com/api/v10";

function discordRequest(
  config: BotConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  if (!config.botToken) throw new Error("discord_token_not_configured");
  return fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bot ${config.botToken}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function classify(response: Response, dm = false): Promise<SendResult> {
  if (response.ok) return { outcome: "delivered" };
  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    const retryHeader = Number(response.headers.get("retry-after") ?? data.retry_after ?? 60);
    return {
      outcome: "retry",
      errorCode: "discord_429",
      retrySeconds: Number.isFinite(retryHeader)
        ? Math.min(3600, Math.max(1, Math.ceil(retryHeader)))
        : 60,
    };
  }
  if (response.status >= 500) return { outcome: "retry", errorCode: `discord_${response.status}` };
  if (dm && response.status === 403 && (await response.json().catch(() => ({}))).code === 50007) {
    return { outcome: "dm_forbidden", errorCode: "discord_dm_50007" };
  }
  return { outcome: "permanent", errorCode: `discord_${response.status}` };
}

export async function sendDiscordDelivery(config: BotConfig, delivery: {
  id: string;
  channel_kind: "dm" | "audit" | "fallback";
  channel_id: string | null;
  guild_id: string;
  discord_user_id: string | null;
  payload: { title?: string; body?: string; link_path?: string };
}): Promise<SendResult> {
  try {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(delivery.id)) {
      return { outcome: "permanent", errorCode: "invalid_delivery" };
    }
    // A UUID in base 36 fits Discord's 25-character message nonce.
    const identity = {
      nonce: BigInt("0x" + delivery.id.replaceAll("-", "")).toString(36),
      enforce_nonce: true,
    };
    if (delivery.channel_kind === "dm") {
      if (!delivery.discord_user_id || !ID.test(delivery.discord_user_id)) {
        return { outcome: "permanent", errorCode: "invalid_user" };
      }
      const dm = await discordRequest(config, "POST", "/users/@me/channels", {
        recipient_id: delivery.discord_user_id,
      });
      if (!dm.ok) return classify(dm, true);
      const channel: { id?: string } = await dm.json();
      if (!channel.id || !ID.test(channel.id)) {
        return { outcome: "retry", errorCode: "invalid_dm_channel" };
      }
      const linkPath = delivery.payload.link_path;
      const components = linkPath && /^\/app\/[a-z0-9/_-]+$/.test(linkPath) &&
          config.siteUrl.startsWith("https://")
        ? [{
          type: 1,
          components: [{
            type: 2,
            style: 5,
            label: "Открыть Banku",
            url: new URL(linkPath, config.siteUrl).toString(),
          }],
        }]
        : [];
      const sent = await discordRequest(config, "POST", `/channels/${channel.id}/messages`, {
        ...identity,
        embeds: [{
          title: String(delivery.payload.title ?? "Banku").slice(0, 200),
          description: String(delivery.payload.body ?? "Откройте Banku для подробностей.").slice(
            0,
            1500,
          ),
          color: 0x0bbfce,
        }],
        components,
        allowed_mentions: { parse: [] },
      });
      return classify(sent, true);
    }
    if (!delivery.channel_id || !ID.test(delivery.channel_id) || !ID.test(delivery.guild_id)) {
      return { outcome: "permanent", errorCode: "invalid_channel" };
    }
    const metadata = await discordRequest(config, "GET", `/channels/${delivery.channel_id}`);
    if (!metadata.ok) return classify(metadata);
    const channel: Channel = await metadata.json();
    if (
      channel.guild_id !== delivery.guild_id || channel.id !== delivery.channel_id ||
      channel.type !== 0
    ) {
      return { outcome: "permanent", errorCode: "wrong_guild_or_channel" };
    }
    if (delivery.channel_kind === "fallback") {
      if (!delivery.discord_user_id || !ID.test(delivery.discord_user_id)) {
        return { outcome: "permanent", errorCode: "invalid_user" };
      }
      // Never mention a user in a different Discord guild.
      const membership = await discordRequest(
        config,
        "GET",
        `/guilds/${delivery.guild_id}/members/${delivery.discord_user_id}`,
      );
      if (membership.status === 404) return { outcome: "permanent", errorCode: "not_in_guild" };
      if (!membership.ok) return classify(membership);
      const sent = await discordRequest(
        config,
        "POST",
        `/channels/${delivery.channel_id}/messages`,
        {
          ...identity,
          content: `<@${delivery.discord_user_id}>, откройте личные сообщения с ботом Banku.`,
          allowed_mentions: {
            parse: [],
            users: [delivery.discord_user_id],
            roles: [],
            replied_user: false,
          },
        },
      );
      return classify(sent);
    }
    if (
      delivery.channel_kind !== "audit" ||
      !auditIsPrivate(channel, delivery.guild_id, staffRoles(channel.id), config.applicationId)
    ) {
      return { outcome: "permanent", errorCode: "unsafe_audit_channel" };
    }
    const sent = await discordRequest(config, "POST", `/channels/${delivery.channel_id}/messages`, {
      ...identity,
      embeds: [{
        title: String(delivery.payload.title ?? "Banku Audit").slice(0, 200),
        description: String(delivery.payload.body ?? "Событие Banku").slice(0, 1500),
        color: 0x4455dd,
      }],
      allowed_mentions: { parse: [] },
    });
    return classify(sent);
  } catch {
    return { outcome: "retry", errorCode: "network_or_timeout" };
  }
}
