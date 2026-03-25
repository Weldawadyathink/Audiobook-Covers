import { z } from "zod/v4";

export const zLogLevel = z.enum(["disabled", "error", "warn", "info", "debug"]);
type LogLevel = z.infer<typeof zLogLevel>;

const defaultLogLevel: LogLevel = "debug";

export class Logger {
  logFunction: (...data: any[]) => void;
  logLevel: LogLevel;

  constructor() {
    this.logFunction = console.log;
    this.logLevel = defaultLogLevel;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  shouldLog(level: LogLevel): boolean {
    if (this.logLevel === "disabled") return false;
    if (this.logLevel === level) return true;

    if (this.logLevel === "warn" && level === "error") return true;

    if (this.logLevel === "info" && level === "warn") return true;
    if (this.logLevel === "info" && level === "error") return true;

    if (this.logLevel === "debug" && level === "info") return true;
    if (this.logLevel === "debug" && level === "warn") return true;
    if (this.logLevel === "debug" && level === "error") return true;

    return false;
  }

  log(level: LogLevel, ...data: any[]) {
    if (!this.shouldLog(level)) return;
    this.logFunction(...data);
  }

  info(...data: any[]) {
    if (!this.shouldLog("info")) return;
    this.log("info", ...data);
  }

  debug(...data: any[]) {
    if (!this.shouldLog("debug")) return;
    this.log("debug", ...data);
  }

  warn(...data: any[]) {
    if (!this.shouldLog("warn")) return;
    this.log("warn", ...data);
  }

  error(...data: any[]) {
    if (!this.shouldLog("error")) return;
    this.log("error", ...data);
  }
}

export const logger = new Logger();
