type Overwrite = { id: string; type: number; allow: string; deny: string };
export type Channel = {
  id: string;
  type: number;
  guild_id?: string;
  permission_overwrites?: Overwrite[];
};

const view = 1024n;
const hasView = (bits: string) => (BigInt(bits) & view) !== 0n;

// Key by channel, not guild: one guild may host several Minecraft servers.
export function auditIsPrivate(
  channel: Channel,
  guild: string,
  roles: string[],
  bot: string,
): boolean {
  const rules = channel.permission_overwrites;
  if (channel.type !== 0 || channel.guild_id !== guild || !Array.isArray(rules) || !roles.length) {
    return false;
  }
  if (!rules.some((rule) => rule.id === guild && rule.type === 0 && hasView(rule.deny))) {
    return false;
  }
  return rules.every((rule) =>
    !hasView(rule.allow) ||
    (rule.type === 0 && rule.id !== guild && roles.includes(rule.id)) ||
    (rule.type === 1 && rule.id === bot)
  );
}

export function staffRoles(channelId: string): string[] {
  let map;
  try {
    map = JSON.parse(Deno.env.get("BANKU_AUDIT_STAFF_ROLES") || "{}");
  } catch {
    return [];
  }
  const ids: unknown = map?.[channelId];
  return Array.isArray(ids) && ids.every((id) => typeof id === "string" && /^\d{15,22}$/.test(id))
    ? ids
    : [];
}
