import { loadConfig } from "./config.ts";
import { processOutbox } from "./delivery.ts";
import { handleInteraction } from "./interactions.ts";

Deno.cron("banku-discord-outbox", "* * * * *", async () => {
  await processOutbox(loadConfig());
});

Deno.serve((request) => {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  }
  if (path === "/interactions") return handleInteraction(request, loadConfig());
  return new Response("Not found", { status: 404 });
});
