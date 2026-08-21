export type LogLevel = "error" | "warn" | "info";

const rank: Record<LogLevel, number> = {
  error: 50,
  warn: 40,
  info: 30,
};

let activeLevel: LogLevel = "info";

export function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "info").trim().toLowerCase();
  if (value === "error" || value === "warn" || value === "info") {
    return value;
  }
  return "info";
}

export function setLogLevel(level: LogLevel): void {
  activeLevel = level;
}

function serializeExtra(extra: unknown): unknown {
  if (extra instanceof Error) {
    return { name: extra.name, message: extra.message, stack: extra.stack };
  }
  return extra;
}

function write(level: LogLevel, msg: string, extra?: unknown): void {
  if (rank[level] < rank[activeLevel]) {
    return;
  }
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (extra !== undefined) {
    line.extra = serializeExtra(extra);
  }
  const text = `${JSON.stringify(line)}\n`;
  if (level === "error") {
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
