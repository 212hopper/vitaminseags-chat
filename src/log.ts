const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LEVELS)[number];

const rank: Record<LogLevel, number> = {
  silent: 100,
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
  return LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : "info";
}

function write(level: Exclude<LogLevel, "silent">, msg: string, extra?: unknown): void {
  if (rank[level] < rank[currentLevel()]) {
    return;
  }
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (extra !== undefined) {
    line.extra = extra instanceof Error ? { name: extra.name, message: extra.message } : extra;
  }
  const text = `${JSON.stringify(line)}\n`;
  if (level === "error" || level === "fatal") {
    process.stderr.write(text);
    return;
  }
  process.stdout.write(text);
}

export const log = {
  info(msg: string, extra?: unknown) {
    write("info", msg, extra);
  },
  warn(msg: string, extra?: unknown) {
    write("warn", msg, extra);
  },
  error(msg: string, extra?: unknown) {
    write("error", msg, extra);
  },
};
