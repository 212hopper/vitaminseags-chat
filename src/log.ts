import { Writable } from "node:stream";

export type LogLevel = "error" | "warn" | "info";
export type FastifyLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

const rank: Record<LogLevel, number> = {
  error: 50,
  warn: 40,
  info: 30,
};

const PINO_LEVEL_NAMES: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

let activeLevel: LogLevel = "info";

export function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "info").trim().toLowerCase();
  if (value === "error" || value === "warn" || value === "info") {
    return value;
  }
  return "info";
}

export function parseFastifyLogLevel(raw: string | undefined, fallback: LogLevel): FastifyLogLevel {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    value === "fatal" ||
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug" ||
    value === "trace" ||
    value === "silent"
  ) {
    return value;
  }
  return fallback;
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

function emit(level: string, msg: string, extra: unknown | undefined, ts = new Date().toISOString()): void {
  const line: Record<string, unknown> = { ts, level, msg };
  if (extra !== undefined) {
    line.extra = serializeExtra(extra);
  }
  const text = `${JSON.stringify(line)}\n`;
  if (level === "error" || level === "fatal") {
    process.stderr.write(text);
    return;
  }
  process.stdout.write(text);
}

function write(level: LogLevel, msg: string, extra?: unknown): void {
  if (rank[level] < rank[activeLevel]) {
    return;
  }
  emit(level, msg, extra);
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

function emitPinoLine(line: string): void {
  const rec = JSON.parse(line) as Record<string, unknown>;
  const level =
    typeof rec.level === "number" ? (PINO_LEVEL_NAMES[rec.level] ?? "info") : String(rec.level ?? "info");
  const msg = typeof rec.msg === "string" ? rec.msg : "";
  const ts = typeof rec.time === "number" ? new Date(rec.time).toISOString() : new Date().toISOString();
  const extra: Record<string, unknown> = { ...rec };
  delete extra.level;
  delete extra.time;
  delete extra.msg;
  delete extra.pid;
  delete extra.hostname;
  delete extra.v;
  emit(level, msg, Object.keys(extra).length ? extra : undefined, ts);
}

export function takeCompleteLines(pending: string, chunk: string): { pending: string; lines: string[] } {
  let buffer = pending + chunk;
  const lines: string[] = [];
  let nl = buffer.indexOf("\n");
  while (nl !== -1) {
    const line = buffer.slice(0, nl).replace(/\r$/, "");
    buffer = buffer.slice(nl + 1);
    if (line) {
      lines.push(line);
    }
    nl = buffer.indexOf("\n");
  }
  return { pending: buffer, lines };
}

export function pinoToAppLogStream(): Writable {
  let pending = "";
  const consume = (chunk: string) => {
    const split = takeCompleteLines(pending, chunk);
    pending = split.pending;
    for (const line of split.lines) {
      try {
        emitPinoLine(line);
      } catch {
        // drop a malformed line rather than printing raw pino JSON
      }
    }
  };
  return new Writable({
    write(chunk, encoding, callback) {
      void encoding;
      consume(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"));
      callback();
    },
    final(callback) {
      if (pending) {
        consume("\n");
      }
      callback();
    },
  });
}
