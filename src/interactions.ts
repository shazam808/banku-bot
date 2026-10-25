import { verifyDiscordRequest } from "./crypto.ts";
import { commandText } from "./commands.ts";
import type { BotConfig } from "./config.ts";

const EPHEMERAL = 1 << 6;
const INITIAL_RESPONSE_BUDGET_MS = 1400;
const response = (data: unknown, status = 200) => Response.json(data, { status });
const unavailable = "Banku временно недоступен. Попробуйте позже.";

async function editDeferredResponse(
  config: BotConfig,
  token: string,
  content: Promise<string>,
): Promise<void> {
  const result = await content;
  const url = `https://discord.com/api/v10/webhooks/${config.applicationId}/${
    encodeURIComponent(token)
  }/messages/@original`;
  const edit = await fetch(url, {
    method: "PATCH",
    signal: AbortSignal.timeout(4000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: result.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (!edit.ok) console.error("[Banku Bot] deferred response failed", { status: edit.status });
}

export async function handleInteraction(request: Request, config: BotConfig): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (Number(request.headers.get("content-length") || "0") > 65536) {
    return new Response(null, { status: 413 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > 65536) return new Response(null, { status: 413 });
  const valid = await verifyDiscordRequest(
    body,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
    config.publicKey,
  );
  if (!valid) return new Response(null, { status: 401 });
  let interaction: Record<string, unknown>;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    interaction = parsed;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (interaction.type === 1) return response({ type: 1 });
  if (interaction.type !== 2) {
    return response({
      type: 4,
      data: { flags: EPHEMERAL, content: "Действие Banku не поддерживается." },
    });
  }
  const contentPromise = commandText(config, interaction).catch(() => unavailable);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = await Promise.race([
    contentPromise.then((content) => ({ ready: true as const, content })),
    new Promise<{ ready: false }>((resolve) => {
      timer = setTimeout(() => resolve({ ready: false }), INITIAL_RESPONSE_BUDGET_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (first.ready) {
    return response({
      type: 4,
      data: {
        flags: EPHEMERAL,
        content: first.content.slice(0, 1900),
        allowed_mentions: { parse: [] },
      },
    });
  }
  if (
    typeof interaction.token === "string" && interaction.token.length > 0 && config.applicationId
  ) {
    void editDeferredResponse(config, interaction.token, contentPromise).catch(() => {
      console.error("[Banku Bot] deferred response unavailable");
    });
    return response({
      type: 5,
      data: { flags: EPHEMERAL },
    });
  }
  return response({ type: 4, data: { flags: EPHEMERAL, content: unavailable } });
}
