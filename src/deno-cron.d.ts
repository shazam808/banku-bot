// Deno Deploy supports cron at runtime, while some builder type libraries omit it.
declare namespace Deno {
  function cron(name: string, schedule: string, handler: () => void | Promise<void>): void;
}
