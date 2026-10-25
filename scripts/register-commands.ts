import { bankCommand } from "../src/commands.ts";

const token = Deno.env.get("DISCORD_BOT_TOKEN");
const applicationId = Deno.env.get("DISCORD_APPLICATION_ID");
const guildId = Deno.env.get("DISCORD_COMMAND_GUILD_ID");
if (!token || !applicationId || !guildId || !/^\d{15,22}$/.test(guildId)) {
  throw new Error("Set DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID and DISCORD_COMMAND_GUILD_ID");
}
const response = await fetch(
  `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify([bankCommand]),
  },
);
if (!response.ok) throw new Error(`Discord command registration failed: HTTP ${response.status}`);
console.log("Banku guild command registered.");
