# Подключение Banku Bot — инструкция владельцу

Выполняйте эти шаги только после отдельного решения о production-включении. Миграции Banku 2.2 и
выпуск сайта/бота должны быть проверены до переключения доставки.

1. В [Deno Deploy](https://console.deno.com) подключите GitHub и выберите **`shazam808/banku-bot`**.
   Используйте новый Deno Deploy, а не Deploy Classic. App Directory — пустое поле (корень
   репозитория) или `.`; абсолютные `/` и `/src` недопустимы. Runtime — Dynamic, Entrypoint —
   `src/main.ts`, Runtime Working Directory не задан. Проверку выполняйте локально через
   `deno task check`; entrypoint задан в корневом `deno.json`. Сначала создайте
   preview-развёртывание.
2. В переменные preview внесите `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`,
   `BANKU_API_URL`, `BANKU_SERVICE_SECRET`, `BANKU_SITE_URL`. Bot Token и service secret отмечайте
   как секреты. Установите `BANKU_ENV=preview`, `BANKU_DELIVERY_ENABLED=false`.
3. В закрытом приложении Banku задайте `BANKU_BOT_API_ENABLED=true` и `BANKU_BOT_SERVICE_SECRET` тем
   же секретом, что у бота. Не копируйте Supabase service-role key в Deno Deploy. После
   согласованного выпуска сайта проверьте защищённый API без реальных BAC.
4. Возьмите публичный HTTPS-адрес развёртывания. `GET /health` должен вернуть `{"status":"ok"}` без
   персональных данных.
5. В Discord Developer Portal существующего Application укажите
   `https://<адрес-развёртывания>/interactions` как Interactions Endpoint URL. Discord проверит PING
   и подпись. Не создавайте второе приложение.
6. Для регистрации команд задайте `DISCORD_COMMAND_GUILD_ID` нужного Guild в локальном `.env.local`
   и **после явного решения о подключении** выполните
   `deno run --env-file=.env.local --allow-net --allow-env scripts/register-commands.ts`. Для
   другого Guild повторите с его ID. Скрипт заменяет набор команд `/bank` в выбранном Guild.
7. На сайте Banku откройте настройки конкретного Minecraft-сервера:
   `/admin/servers/<server-id>/discord`. Global Owner вводит Guild ID, закрытый Audit Channel ID и
   Notifications Channel ID. Проверьте права бота `View Channel`, `Send Messages`, `Embed Links`, а
   также доступность slash-команд. Роль `Administrator` не требуется. Доступ игроков к audit-каналу
   должен быть закрыт в настройках Discord.
8. Проверьте `/bank balance`, `/bank history`, `/bank account`, `/bank help` с тестовым
   OAuth-профилем и разрешённым сервером. Временно закрытый или не принадлежащий игроку сервер не
   должен раскрывать данные. Банковский персонал проверяет `/bank checks` и `/bank check`. Замедлите
   тестовый ответ Banku и убедитесь, что отложенный приватный ответ обновляется после
   первоначального подтверждения на реальном preview Deno Deploy.
9. На изолированном тестовом банковском событии проверьте DM, запись в закрытом audit-канале и
   уведомление на сайте. Затем запретите DM тестовому пользователю и проверьте нейтральный fallback
   в отдельном канале. В fallback не должны появляться суммы и банковские детали.
10. После разрешения production задайте `BANKU_ENV=production`, `BANKU_DELIVERY_ENABLED=true`,
    включите конфигурацию нужного сервера на сайте. Проверяйте статусы outbox и логи Deno Deploy;
    cron работает раз в минуту. Не включайте delivery в preview с production API.
11. При неудачном выпуске немедленно установите `BANKU_DELIVERY_ENABLED=false` и/или отключите
    конфигурацию сервера, затем откатите revision в Deno Deploy. Не удаляйте outbox и уведомления:
    их можно обработать после устранения причины. Если скомпрометирован секрет, замените его в обоих
    сервисах до повторного включения.

Секреты никогда не записывайте в GitHub, SQL-миграции, README или публичные журналы. Открытый код
бота не означает открытый доступ к данным Banku. Если бывший секрет когда-либо попал в историю Git,
его нужно ротировать; добавление `.gitignore` не удаляет историю.
