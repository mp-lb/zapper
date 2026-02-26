export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerOptions {
  level?: LogLevel;
  silent?: boolean;
  timestamp?: boolean;
}

export interface LoggerSink {
  log: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const colors = {
  reset: "\u001B[0m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  white: "\u001B[37m",
};

const emoji = {
  error: "❌",
  warn: "⚠️",
  info: "🔹",
  debug: "🐞",
  success: "⚡️",
};

interface Options {
  data?: unknown;
  noEmoji?: boolean;
}

export class Logger {
  private level: LogLevel;
  private silent: boolean;
  private timestamp: boolean;
  private sink: LoggerSink | null;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.silent = options.silent ?? false;
    this.timestamp = options.timestamp ?? false;
    this.sink = null;
  }

  private prefix(): string {
    return this.timestamp ? `[${new Date().toISOString()}] ` : "";
  }

  private shouldLog(level: LogLevel): boolean {
    return !this.silent && level <= this.level;
  }

  private formatData(data?: unknown): string {
    if (data === undefined) return "";
    if (data instanceof Error) {
      const stack = data.stack ? `\n${data.stack}` : "";
      return ` ${data.name}: ${data.message}${stack}`;
    }
    try {
      return ` ${JSON.stringify(data)}`;
    } catch {
      return ` ${String(data)}`;
    }
  }

  private withEmojiPrefix(
    kind: "error" | "warn" | "info" | "debug" | "success",
    message: string,
    disable?: boolean,
  ): string {
    if (disable) return message;
    // Ensure single space between emoji and message
    return `${this.prefix()}${emoji[kind]} ${message}`;
  }

  error(message: string, options: Options = {}): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const msg = `${this.withEmojiPrefix("error", message, options.noEmoji)}${this.formatData(options.data)}`;
    this.sink?.error(`${colors.red}${msg}${colors.reset}`);
  }

  warn(message: string, options: Options = {}): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const msg = `${this.withEmojiPrefix("warn", message, options.noEmoji)}${this.formatData(options.data)}`;
    this.sink?.warn(`${colors.yellow}${msg}${colors.reset}`);
  }

  info(message: string, options: Options = {}): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const msg = `${this.withEmojiPrefix("info", message, options.noEmoji)}${this.formatData(options.data)}`;
    this.sink?.log(`${colors.white}${msg}${colors.reset}`);
  }

  debug(message: string, options: Options = {}): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const msg = `${this.withEmojiPrefix("debug", message, options.noEmoji)}${this.formatData(options.data)}`;
    this.sink?.log(msg);
  }

  success(message: string, options: Options = {}): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const msg = `${this.withEmojiPrefix("success", message, options.noEmoji)}${this.formatData(options.data)}`;
    this.sink?.log(`${colors.green}${msg}${colors.reset}`);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setSilent(silent: boolean): void {
    this.silent = silent;
  }

  setTimestamp(timestamp: boolean): void {
    this.timestamp = timestamp;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setSink(sink: LoggerSink | null): void {
    this.sink = sink;
  }
}

// Default logger instance
export const logger = new Logger();

// Create logger with specific options
export const createLogger = (options: LoggerOptions): Logger =>
  new Logger(options);
