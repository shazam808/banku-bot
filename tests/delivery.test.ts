import assert from "node:assert/strict";
import { sendDiscordDelivery } from "../src/discord.ts";
import { processOutbox } from "../src/delivery.ts";
import type { BotConfig } from "../src/config.ts";

const config: BotConfig = {
  applicationId: "123456789012345678",
  publicKey: "",
  botToken: "test",
  bankuApiUrl: "https://banku.example",
  bankuServiceSecret: "a".repeat(48),
  siteUrl: "https://banku.example",
  deliveryEnabled: true,
  environment: "production",
};
const delivery = {
  channel_kind: "dm" as const,
  channel_id: null,
  guild_id: "111111111111111111",
  discord_user_id: "222222222222222222",
  payload: { title: "Banku", body: "25 BAC", link_path: "/app/banku-smp/account" },
};

Deno.test("DM forbidden is permanent; fallback reveals no financial details", async () => {
  const original = globalThis.fetch;
  const requests: { url: string; body: unknown }[] = [];
  globalThis.fetch = (url, init) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).endsWith("/users/@me/channels")) {
      return Promise.resolve(Response.json({ code: 50007 }, { status: 403 }));
    }
    if (String(url).includes("/guilds/")) {
      return Promise.resolve(Response.json({ user: { id: delivery.discord_user_id } }));
    }
    return Promise.resolve(Response.json({ id: "333333333333333333" }));
  };
  try {
    const dm = await sendDiscordDelivery(config, delivery);
    assert.equal(dm.outcome, "dm_forbidden");
    const fallback = await sendDiscordDelivery(config, {
      ...delivery,
      channel_kind: "fallback",
      channel_id: "444444444444444444",
    });
    assert.equal(fallback.outcome, "delivered");
    const publicBody = JSON.stringify(requests.at(-1)?.body);
    assert.doesNotMatch(publicBody, /25 BAC/);
    assert.deepEqual(
      (requests.at(-1)?.body as { allowed_mentions: { users: string[] } })
        .allowed_mentions.users,
      [delivery.discord_user_id],
    );
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("no fallback ping when user is absent from the configured guild", async () => {
  const original = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = (url, init) => {
    if (init?.method === "POST") posts++;
    if (String(url).includes("/guilds/")) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    return Promise.resolve(Response.json({}));
  };
  try {
    const result = await sendDiscordDelivery(config, {
      ...delivery,
      channel_kind: "fallback",
      channel_id: "444444444444444444",
    });
    assert.equal(result.errorCode, "not_in_guild");
    assert.equal(posts, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("preview environment does not lease or deliver production notifications", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return Promise.resolve(Response.json({ deliveries: [] }));
  };
  try {
    await processOutbox({ ...config, environment: "preview" });
    await processOutbox({ ...config, deliveryEnabled: false });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("Discord rate limits and 5xx cause bounded retries without fallback", async () => {
  const original = globalThis.fetch;
  let status = 429;
  globalThis.fetch = (url) => {
    if (String(url).endsWith("/users/@me/channels")) {
      return Promise.resolve(Response.json({ id: "333333333333333333" }));
    }
    return Promise.resolve(
      new Response(null, {
        status,
        headers: status === 429 ? { "retry-after": "3" } : undefined,
      }),
    );
  };
  try {
    const limited = await sendDiscordDelivery(config, delivery);
    assert.equal(limited.outcome, "retry");
    assert.equal(limited.retrySeconds, 3);
    status = 503;
    const unavailable = await sendDiscordDelivery(config, delivery);
    assert.equal(unavailable.outcome, "retry");
    assert.equal(unavailable.errorCode, "discord_503");
  } finally {
    globalThis.fetch = original;
  }
});
