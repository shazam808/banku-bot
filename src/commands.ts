import { callBanku } from "./banku-api.ts";
import type { BotConfig } from "./config.ts";

type Option = { name?: string; value?: unknown; options?: Option[] };
type Interaction = {
  data?: { name?: string; options?: Option[] };
  guild_id?: string;
  member?: { user?: { id?: string } };
  user?: { id?: string };
};

function option(options: Option[], name: string): string | undefined {
  const value = options.find((item) => item.name === name)?.value;
  return typeof value === "string" ? value : undefined;
}

function bac(value: unknown): string {
  const amount = typeof value === "number" || typeof value === "string" ? String(value) : "0";
  return /^\d+(?:\.\d{1,2})?$/.test(amount) ? `${amount.replace(".", ",")} BAC` : "— BAC";
}

export async function commandText(config: BotConfig, interaction: Interaction): Promise<string> {
  if (interaction.data?.name !== "bank") return "Неизвестная команда Banku.";
  const sub = interaction.data.options?.[0];
  const command = sub?.name;
  if (!command) return "Выберите команду `/bank`.";
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!userId || !/^\d{15,22}$/.test(userId)) return "Не удалось определить пользователя Discord.";
  const options = sub.options ?? [];
  if (command === "help") {
    let staff = "";
    try {
      const access = await callBanku(config, {
        action: "query",
        operation: "checks",
        discord_user_id: userId,
        guild_id: interaction.guild_id ?? null,
        server_slug: option(options, "server") ?? null,
      });
      if (Array.isArray(access.checks)) staff = "\nПерсонал: `/bank checks`, `/bank check`.";
    } catch { /* Help remains available if Banku is temporarily unavailable. */ }
    return "Banku: `/bank balance`, `/bank history`, `/bank account`, `/bank help`." + staff;
  }
  const operations: Record<string, string> = {
    balance: "balance",
    history: "history",
    account: "account",
    checks: "checks",
    check: "check",
  };
  if (!operations[command]) return "Неизвестная команда Banku.";
  const result = await callBanku(config, {
    action: "query",
    operation: operations[command],
    discord_user_id: userId,
    guild_id: interaction.guild_id ?? null,
    server_slug: option(options, "server") ?? null,
    check_code: option(options, "code") ?? null,
  });
  if (Array.isArray(result.select_server)) {
    const names = result.select_server.slice(0, 10).map((value) => {
      const server = value as { name?: string; slug?: string };
      return `• ${server.name ?? "Сервер"} — \`${server.slug ?? ""}\``;
    });
    return `Укажите параметр \`server\` для нужного сервера:\n${names.join("\n")}`;
  }
  if (result.error) {
    const messages: Record<string, string> = {
      account_unavailable:
        "Банковский счёт недоступен. Проверьте авторизацию и доступ к серверу на сайте Banku.",
      server_unavailable: "Сервер недоступен для этого аккаунта Discord.",
      history_disabled: "История операций отключена на этом сервере.",
      forbidden: "Недостаточно банковских прав для просмотра чеков.",
    };
    return messages[String(result.error)] ?? "Не удалось получить данные Banku.";
  }
  const server = result.server as { name?: string; slug?: string } | undefined;
  const label = server?.name ?? "Сервер";
  if (command === "balance") {
    return `**${label}** · личный счёт\nБаланс: **${bac(result.balance)}**\nЗаблокировано: ${
      bac(result.locked_balance)
    }.`;
  }
  if (command === "account") {
    return `**${label}** · ${result.minecraft_username ?? "Игрок"}\nСтатус: ${
      result.account_status ?? "—"
    }\n${result.account_url ?? ""}`;
  }
  if (command === "history") {
    const rows = Array.isArray(result.history) ? result.history : [];
    if (!rows.length) return `**${label}** · завершённых операций пока нет.`;
    return `**${label}** · последние операции:\n` + rows.slice(0, 5).map((item) => {
      const row = item as {
        direction?: string;
        amount?: unknown;
        type?: string;
        completed_at?: string;
      };
      return `${row.direction === "incoming" ? "+" : "−"}${bac(row.amount)} · ${
        row.type ?? "Операция"
      }`;
    }).join("\n");
  }
  const checks = Array.isArray(result.checks) ? result.checks : [];
  if (!checks.length) return `**${label}** · подходящих чеков нет.`;
  return `**${label}** · чеки:\n` + checks.slice(0, 10).map((item) => {
    const row = item as { public_code?: string; direction?: string; status?: string };
    return `• ${row.public_code ?? "—"} · ${row.direction ?? "—"} · ${row.status ?? "—"}`;
  }).join("\n") + `\n${result.checks_url ?? ""}`;
}

export const bankCommand = {
  name: "bank",
  description: "Banku: личный счёт и банковские операции",
  options: [
    ...(["balance", "history", "account", "checks"] as const).map((name) => ({
      type: 1,
      name,
      description: ({
        balance: "Мой баланс",
        history: "Мои последние операции",
        account: "Мой счёт",
        checks: "Ожидающие чеки (персонал)",
      })[name],
      options: [{
        type: 3,
        name: "server",
        description: "Slug Minecraft-сервера",
        required: false,
      }],
    })),
    {
      type: 1,
      name: "check",
      description: "Статус чека (персонал)",
      options: [
        { type: 3, name: "code", description: "Код чека", required: true },
        { type: 3, name: "server", description: "Slug Minecraft-сервера", required: false },
      ],
    },
    { type: 1, name: "help", description: "Справка по командам" },
  ],
};
