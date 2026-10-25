import assert from "node:assert/strict";
import { signBankuRequest, verifyDiscordRequest } from "../src/crypto.ts";
import { handleInteraction } from "../src/interactions.ts";
import type { BotConfig } from "../src/config.ts";

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
const config: BotConfig = {
  applicationId: "123456789012345678",
  publicKey: "",
  botToken: "test",
  bankuApiUrl: "https://banku.example",
  bankuServiceSecret: "a".repeat(48),
  siteUrl: "https://banku.example",
  deliveryEnabled: false,
  environment: "preview",
};

Deno.test("valid Discord signature, invalid signature, tampering and stale timestamp", async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const key = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const body = encoder.encode('{"type":1}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = async (stamp: string) =>
    hex(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        encoder.encode(stamp + new TextDecoder().decode(body)),
      ),
    );
  const signature = await sign(timestamp);
  assert.equal(await verifyDiscordRequest(body, signature, timestamp, key), true);
  assert.equal(await verifyDiscordRequest(body, "0".repeat(128), timestamp, key), false);
  assert.equal(
    await verifyDiscordRequest(encoder.encode('{"type":2}'), signature, timestamp, key),
    false,
  );
  assert.equal(
    await verifyDiscordRequest(body, signature, String(Number(timestamp) - 3600), key),
    false,
  );
  assert.equal(await verifyDiscordRequest(body, null, timestamp, key), false);
});

Deno.test("interaction PING and private balance use signed actor identity", async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const activeConfig = { ...config, publicKey };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const makeRequest = async (value: unknown) => {
    const body = JSON.stringify(value);
    const signature = hex(
      await crypto.subtle.sign("Ed25519", pair.privateKey, encoder.encode(timestamp + body)),
    );
    return new Request("https://bot.example/interactions", {
      method: "POST",
      body,
      headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
    });
  };
  const ping = await handleInteraction(await makeRequest({ type: 1 }), activeConfig);
  assert.deepEqual(await ping.json(), { type: 1 });
  const unsigned = await handleInteraction(
    new Request("https://bot.example/interactions", { method: "POST", body: '{"type":1}' }),
    activeConfig,
  );
  assert.equal(unsigned.status, 401);

  const previousFetch = globalThis.fetch;
  let seen: Record<string, unknown> | null = null;
  globalThis.fetch = (_url, init) => {
    seen = JSON.parse(String(init?.body));
    return Promise.resolve(
      Response.json({
        server: { name: "Banku SMP", slug: "banku-smp" },
        balance: "25.00",
        locked_balance: "0.00",
      }),
    );
  };
  try {
    const command = await handleInteraction(
      await makeRequest({
        type: 2,
        member: { user: { id: "111111111111111111" } },
        guild_id: "222222222222222222",
        data: {
          name: "bank",
          options: [{
            name: "balance",
            options: [
              { name: "server", value: "banku-smp" },
              { name: "discord_user_id", value: "999999999999999999" },
            ],
          }],
        },
      }),
      activeConfig,
    );
    const answer = await command.json();
    assert.equal(answer.type, 4);
    assert.equal(answer.data.flags, 64);
    assert.match(answer.data.content, /25,00 BAC/);
    assert.equal((seen as Record<string, unknown> | null)?.discord_user_id, "111111111111111111");
    assert.equal((seen as Record<string, unknown> | null)?.guild_id, "222222222222222222");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test("service request signature changes with body and nonce", async () => {
  const first = await signBankuRequest(
    "s".repeat(40),
    '{"action":"query"}',
    crypto.randomUUID(),
    "1771000000",
  );
  const second = await signBankuRequest(
    "s".repeat(40),
    '{"action":"lease"}',
    crypto.randomUUID(),
    "1771000000",
  );
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

Deno.test("slow bank response is deferred and edited privately", async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: 2,
    token: "test-interaction-token",
    member: { user: { id: "111111111111111111" } },
    guild_id: "222222222222222222",
    data: { name: "bank", options: [{ name: "balance", options: [] }] },
  });
  const signature = hex(
    await crypto.subtle.sign("Ed25519", pair.privateKey, encoder.encode(timestamp + body)),
  );
  const request = new Request("https://bot.example/interactions", {
    method: "POST",
    body,
    headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
  });
  const previousFetch = globalThis.fetch;
  let resolveBanku: ((response: Response) => void) | undefined;
  let resolveEdit: ((body: Record<string, unknown>) => void) | undefined;
  const editSeen = new Promise<Record<string, unknown>>((resolve) => {
    resolveEdit = resolve;
  });
  globalThis.fetch = (url, init) => {
    if (String(url).includes("/api/bot/v1")) {
      return new Promise<Response>((resolve) => {
        resolveBanku = resolve;
      });
    }
    if (String(url).includes("/messages/@original")) {
      resolveEdit?.(JSON.parse(String(init?.body)));
      return Promise.resolve(Response.json({ ok: true }));
    }
    throw new Error("Unexpected outbound request");
  };
  try {
    const initial = await handleInteraction(request, { ...config, publicKey });
    const initialBody = await initial.json();
    assert.equal(initialBody.type, 5);
    assert.equal(initialBody.data.flags, 64);
    resolveBanku?.(Response.json({
      server: { name: "Banku SMP", slug: "banku-smp" },
      balance: "12.00",
      locked_balance: "0.00",
    }));
    const edited = await editSeen;
    assert.match(String(edited.content), /12,00 BAC/);
    assert.deepEqual(edited.allowed_mentions, { parse: [] });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
