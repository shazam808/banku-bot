# Banku Bot

Официальный Discord-бот Banku. Исходный код бота открыт; счета BAC, финансовые RPC и база данных
остаются в закрытом приложении Banku.

## Что реализовано

- Приватные slash-команды `/bank balance`, `/bank history`, `/bank account`, `/bank help` и
  доступные банковскому персоналу `/bank checks`, `/bank check`.
- Проверка Ed25519-подписи Discord на исходном теле запроса. Если банковский ответ задерживается,
  команда получает приватное отложенное подтверждение с последующим обновлением ответа.
- Личные уведомления, закрытый Discord-аудит и нейтральное резервное сообщение, когда DM запрещены.
- Ежеминутная обработка заданий из PostgreSQL outbox Banku через подписанный API. Бот не хранит
  балансы и не выполняет финансовые действия.

## Структура

| Путь                                     | Назначение                                            |
| ---------------------------------------- | ----------------------------------------------------- |
| `src/main.ts`                            | HTTP `/health`, `/interactions` и расписание доставки |
| `src/interactions.ts`, `src/commands.ts` | Проверка и обработка slash-команд                     |
| `src/banku-api.ts`, `src/crypto.ts`      | Подпись запросов и проверка Discord                   |
| `src/delivery.ts`, `src/discord.ts`      | Доставка DM, audit и fallback                         |
| `scripts/register-commands.ts`           | Явная регистрация команд в выбранном Guild            |
| `tests/`                                 | Локальные тесты без реальных BAC и Discord-секретов   |
| `docs/`                                  | Протокол API и инструкция владельцу                   |

## Переменные окружения

Скопируйте `.env.example` в локальный `.env.local` и заполните его. Настоящие значения храните
только локально или в секретах Deno Deploy. Для сайта Banku отдельно нужны
`BANKU_BOT_API_ENABLED=true` и `BANKU_BOT_SERVICE_SECRET`; последний должен совпадать с
`BANKU_SERVICE_SECRET` бота.

| Переменная бота            | Назначение                                                       |
| -------------------------- | ---------------------------------------------------------------- |
| `DISCORD_APPLICATION_ID`   | ID существующего Discord Application                             |
| `DISCORD_PUBLIC_KEY`       | Публичный ключ подписи interactions                              |
| `DISCORD_BOT_TOKEN`        | Секрет Discord Bot Token                                         |
| `BANKU_API_URL`            | HTTPS-адрес сайта Banku                                          |
| `BANKU_SERVICE_SECRET`     | Отдельный общий секрет межсервисных запросов, минимум 32 символа |
| `BANKU_SITE_URL`           | Ссылка в сообщениях, например `https://banku-minecraft.online`   |
| `BANKU_ENV`                | `preview` или `production`                                       |
| `BANKU_DELIVERY_ENABLED`   | `true` включает отправку только вместе с `BANKU_ENV=production`  |
| `DISCORD_COMMAND_GUILD_ID` | Guild для ручной регистрации slash-команд                        |

## Локальная проверка

Нужен Deno 2. Команды не обращаются к реальным финансовым данным:

```sh
deno task check
deno task lint
deno task fmt:check
deno task test
```

Deno Deploy использует корень репозитория как App Directory (`/`), выполняет `deno task check` как
Build command и запускает Dynamic Entrypoint `./src/main.ts`. App Directory `src` здесь недопустима:
она превращает путь entrypoint в `src/src/main.ts`. Build command и entrypoint закреплены в корневом
`deno.json`; App Directory задаётся в панели Deno Deploy.

Для локального HTTP-сервера создайте `.env.local`, оставьте `BANKU_ENV=preview` и
`BANKU_DELIVERY_ENABLED=false`, затем запустите `deno task dev`. `/health` сообщает только
`{"status":"ok"}`. Для проверки публичного Discord endpoint нужен доступный Discord по HTTPS адрес и
отдельное разрешение на подключение приложения. Команды регистрируются **отдельным** запуском
`deno run --env-file=.env.local --allow-net --allow-env scripts/register-commands.ts`.

## Безопасность и ограничения

Ответы с балансом и историей являются ephemeral. Discord User ID берётся только из подписанного
interaction; сервер, членство и права проверяет Banku. Сервисный API допускает только чтение
разрешённой информации и операции с очередью сообщений. Публичный fallback не содержит сумм,
адресатов или подробностей банковских событий. Отправка в Discord гарантирует попытки доставки, но
не exactly-once: при потере ответа Discord после отправки возможен повтор сообщения. Финансовая
операция при этом не повторяется.

Настройка Guild и каналов хранится в Banku для каждого Minecraft-сервера. Канал аудита должен быть
закрыт для игроков. Обработчик доставки в preview выключен даже при наличии задания cron. Правила
настройки и выпуска описаны в [инструкции владельцу](docs/OWNER_SETUP.md), протокол — в
[описании API](docs/BANKU_API.md).

Лицензия пока не выбрана владельцем. Публикация исходников сама по себе не предоставляет право на
использование по открытой лицензии.
