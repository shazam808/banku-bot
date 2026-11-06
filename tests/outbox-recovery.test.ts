import assert from "node:assert/strict";
import type { BotConfig } from "../src/config.ts";
import { processOutbox } from "../src/delivery.ts";

Deno.test("re-leased DM after lost ACK has the same Discord nonce and acknowledges the new lease", async () => {
  const config = {
    deliveryEnabled: true,
    environment: "production",
    siteUrl: "https://banku.example",
    botToken: "fixture",
    bankuApiUrl: "https://banku.example",
    bankuServiceSecret: "s".repeat(40),
  } as BotConfig;
  const original = globalThis.fetch;
  const job = {
    id: crypto.randomUUID(),
    channel_kind: "dm",
    discord_user_id: "123456789012345678",
    payload: { title: "fixture" },
  };
  const nonces: string[] = [];
  const acks: string[] = [];
  let lease = "", completed = false;
  globalThis.fetch = (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).startsWith(config.bankuApiUrl)) {
      assert.ok(new Headers(init?.headers).get("x-banku-signature"));
      if (body.action === "lease") {
        assert.equal(body.single, true);
        lease = crypto.randomUUID();
        return Promise.resolve(
          Response.json({ deliveries: completed ? [] : [{ ...job, lease_token: lease }] }),
        );
      }
      assert.equal(body.lease_token, lease);
      assert.equal(body.outcome, "delivered");
      acks.push(lease);
      if (acks.length === 1) return Promise.resolve(new Response(null, { status: 503 }));
      completed = true;
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (String(url).endsWith("/users/@me/channels")) {
      return Promise.resolve(Response.json({ id: "123456789012345679" }));
    }
    assert.equal(body.enforce_nonce, true);
    nonces.push(body.nonce);
    return Promise.resolve(Response.json({ id: "fixture" }));
  };
  try {
    await processOutbox(config);
    await processOutbox(config);
    assert.ok(completed);
    assert.equal(nonces.length, 2);
    assert.equal(nonces[0], nonces[1]);
    assert.notEqual(acks[0], acks[1]);
  } finally {
    globalThis.fetch = original;
  }
});
