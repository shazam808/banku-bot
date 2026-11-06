import assert from "node:assert/strict";
import { sendDiscordDelivery } from "../src/discord.ts";
import type { BotConfig } from "../src/config.ts";
const guild = "111111111111111111", channel = "222222222222222222", staff = "333333333333333333";
const bot = "444444444444444444", user = "555555555555555555";
const job = {
  id: crypto.randomUUID(),
  channel_kind: "audit" as const,
  channel_id: channel,
  guild_id: guild,
  discord_user_id: user,
  payload: { body: "private incident" },
};
const config = { botToken: "fake", applicationId: bot } as BotConfig;
Deno.test("audit verifies guild, everyone deny and the explicit staff-only grant before every send", async () => {
  const original = globalThis.fetch;
  const before = Deno.env.get("BANKU_AUDIT_STAFF_ROLES");
  Deno.env.set("BANKU_AUDIT_STAFF_ROLES", JSON.stringify({ [channel]: [staff] }));
  let posts = 0, guildId = guild, role = staff, deny = "0";
  const nonces: string[] = [];
  globalThis.fetch = (_url, init) => {
    if (init?.method === "GET") {
      return Promise.resolve(Response.json({
        type: 0,
        id: channel,
        guild_id: guildId,
        permission_overwrites: [{ id: guild, type: 0, allow: "0", deny }, {
          id: role,
          type: 0,
          allow: "1024",
          deny: "0",
        }],
      }));
    }
    posts++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.enforce_nonce, true);
    nonces.push(body.nonce);
    return Promise.resolve(Response.json({}));
  };
  try {
    assert.equal((await sendDiscordDelivery(config, job)).errorCode, "unsafe_audit_channel");
    deny = "1024";
    role = user;
    assert.equal((await sendDiscordDelivery(config, job)).errorCode, "unsafe_audit_channel");
    guildId = bot;
    role = staff;
    assert.equal((await sendDiscordDelivery(config, job)).errorCode, "wrong_guild_or_channel");
    assert.equal(posts, 0);
    guildId = guild;
    assert.equal((await sendDiscordDelivery(config, job)).outcome, "delivered");
    assert.equal((await sendDiscordDelivery(config, job)).outcome, "delivered");
    assert.equal(nonces[0], nonces[1]);
    assert.ok(nonces[0].length <= 25);
  } finally {
    globalThis.fetch = original;
    if (before === undefined) Deno.env.delete("BANKU_AUDIT_STAFF_ROLES");
    else Deno.env.set("BANKU_AUDIT_STAFF_ROLES", before);
  }
});
Deno.test("permission errors never masquerade as blocked DM; body retry_after survives fractional seconds", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(Response.json({ code: 50013 }, { status: 403 }));
    assert.equal(
      (await sendDiscordDelivery(config, { ...job, channel_kind: "dm" })).outcome,
      "permanent",
    );
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ retry_after: 2.3, global: true }, { status: 429 }));
    assert.equal(
      (await sendDiscordDelivery(config, { ...job, channel_kind: "dm" })).retrySeconds,
      3,
    );
  } finally {
    globalThis.fetch = original;
  }
});
