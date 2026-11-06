/// <reference path="./deno-cron.d.ts" />
import { loadConfig } from "./config.ts";
import { processOutbox } from "./delivery.ts";
import { handleInteraction } from "./interactions.ts";

// Deno Deploy discovers schedules while building. Production settings are read at execution.
Deno.cron("banku-discord-outbox", "* * * * *", async () => {
  if (Deno.env.get("DENO_TIMELINE") !== "production") return;
  const config = loadConfig();
  if (config.environment !== "production" || !config.deliveryEnabled) return;
  await processOutbox(config);
});

Deno.serve((request) => {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    return Response.json({ status: "ok", service: "interactions", gateway: "separate_worker" }, {
      headers: { "cache-control": "no-store" },
    });
  }
  if (path === "/interactions") return handleInteraction(request, loadConfig());
  return new Response("Not found", { status: 404 });
});
