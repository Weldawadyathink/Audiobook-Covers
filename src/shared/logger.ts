import { log } from "console";

type LogLevel = "debug" | "info" | "warn" | "error" | "disabled";

const defaultLogLevel: LogLevel = "debug";

const logGlobal = globalThis as unknown as {
  logLevel: LogLevel | undefined;
};

function getLogLevel(): LogLevel {
  if (logGlobal.logLevel === undefined) {
    logGlobal.logLevel = defaultLogLevel;
  }
  return logGlobal.logLevel;
}

function shouldLog(level: LogLevel): boolean {
  const logLevel = getLogLevel();
  if (logLevel === "disabled") return false;
  if (logLevel === level) return true;

  if (logLevel === "debug" && level === "info") return true;
  if (logLevel === "debug" && level === "warn") return true;
  if (logLevel === "debug" && level === "error") return true;

  if (logLevel === "info" && level === "warn") return true;
  if (logLevel === "info" && level === "error") return true;

  if (logLevel === "warn" && level === "error") return true;

  return false;
}

export const logger = {
  setLogLevel: (level: LogLevel) => {
    logGlobal.logLevel = level;
  },

  log: (level: LogLevel, ...data: any[]) => {
    if (!shouldLog(level)) return;
    log(...data);
  },

  debug: (...data: any[]) => {
    logger.log("debug", ...data);
  },

  info: (...data: any[]) => {
    logger.log("info", ...data);
  },

  warn: (...data: any[]) => {
    logger.log("warn", ...data);
  },

  error: (...data: any[]) => {
    logger.log("error", ...data);
  },
};
