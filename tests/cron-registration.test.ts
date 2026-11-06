import assert from "node:assert/strict";

Deno.test("schedule is discovered without runtime env; only enabled production leases deliveries", async () => {
  const envKeys = [
    "DENO_TIMELINE",
    "BANKU_ENV",
    "BANKU_DELIVERY_ENABLED",
    "BANKU_API_URL",
    "BANKU_SERVICE_SECRET",
  ];
  const previous = envKeys.map((key) => Deno.env.get(key));
  const originalCron = Object.getOwnPropertyDescriptor(Deno, "cron");
  const originalServe = Object.getOwnPropertyDescriptor(Deno, "serve");
  const originalFetch = globalThis.fetch;
  let tick: (() => Promise<void>) | undefined;
  let leases = 0;
  try {
    for (const key of envKeys) Deno.env.delete(key);
    Object.defineProperty(Deno, "cron", {
      configurable: true,
      value(name: string, schedule: string, fn: () => Promise<void>) {
        assert.equal(name, "banku-discord-outbox");
        assert.equal(schedule, "* * * * *");
        assert.equal(tick, undefined);
        tick = fn;
      },
    });
    Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
    globalThis.fetch = (_input, init) => {
      assert.equal(JSON.parse(String(init?.body)).action, "lease");
      leases++;
      return Promise.resolve(Response.json({ deliveries: [] }));
    };
    await import("../src/main.ts");
    assert.ok(tick);
    await tick();
    Deno.env.set("BANKU_ENV", "production");
    Deno.env.set("BANKU_DELIVERY_ENABLED", "true");
    Deno.env.set("DENO_TIMELINE", "git-branch/main");
    await tick();
    Deno.env.set("DENO_TIMELINE", "production");
    Deno.env.set("BANKU_DELIVERY_ENABLED", "false");
    await tick();
    Deno.env.set("BANKU_DELIVERY_ENABLED", "true");
    Deno.env.set("BANKU_ENV", "preview");
    await tick();
    assert.equal(leases, 0);
    Deno.env.set("BANKU_ENV", "production");
    Deno.env.set("BANKU_API_URL", "https://banku.invalid");
    Deno.env.set("BANKU_SERVICE_SECRET", "x".repeat(32));
    await tick();
    assert.equal(leases, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCron) Object.defineProperty(Deno, "cron", originalCron);
    else Reflect.deleteProperty(Deno, "cron");
    if (originalServe) Object.defineProperty(Deno, "serve", originalServe);
    envKeys.forEach((key, i) =>
      previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!)
    );
  }
});
