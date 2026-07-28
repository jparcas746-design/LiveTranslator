type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, scope: string, message: string, details?: unknown) {
  const payload = {
    scope,
    message,
    details,
    time: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}

export const thorLogger = {
  info: (scope: string, message: string, details?: unknown) =>
    log("info", scope, message, details),
  warn: (scope: string, message: string, details?: unknown) =>
    log("warn", scope, message, details),
  error: (scope: string, message: string, details?: unknown) =>
    log("error", scope, message, details),
};
