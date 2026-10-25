export type BotConfig = {
  applicationId: string;
  publicKey: string;
  botToken: string;
  bankuApiUrl: string;
  bankuServiceSecret: string;
  siteUrl: string;
  deliveryEnabled: boolean;
  environment: string;
};

export function loadConfig(): BotConfig {
  return {
    applicationId: Deno.env.get("DISCORD_APPLICATION_ID") ?? "",
    publicKey: Deno.env.get("DISCORD_PUBLIC_KEY") ?? "",
    botToken: Deno.env.get("DISCORD_BOT_TOKEN") ?? "",
    bankuApiUrl: Deno.env.get("BANKU_API_URL") ?? "",
    bankuServiceSecret: Deno.env.get("BANKU_SERVICE_SECRET") ?? "",
    siteUrl: Deno.env.get("BANKU_SITE_URL") ?? "",
    deliveryEnabled: Deno.env.get("BANKU_DELIVERY_ENABLED") === "true",
    environment: Deno.env.get("BANKU_ENV") ?? "preview",
  };
}
