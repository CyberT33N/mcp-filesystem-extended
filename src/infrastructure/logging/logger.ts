import pino from "pino";
import path from "path";
import fs from "fs";

const projectRoot = path.resolve(process.cwd());
const logsDir = path.join(projectRoot, "logs");

// Ensure logs directory exists synchronously before creating the logger
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch {
  // If log directory cannot be created, fallback to stdout
}

const logFilePath = path.join(logsDir, "log.txt");

/**
 * Truncates the active log file at startup so each server process begins with a clean log surface.
 *
 * @remarks
 * Called once at server startup before the Pino destination is opened. Errors are silently swallowed
 * so a non-writable log path never blocks the server from starting.
 */
function truncateLogFileOnStartup(): void {
  try {
    fs.writeFileSync(logFilePath, "", { flag: "w" });
  } catch {
    // Silently ignore — log rotation failure must never block server startup.
  }
}

truncateLogFileOnStartup();

const destination = (() => {
  try {
    return pino.destination({ dest: logFilePath, sync: false });
  } catch {
    // Fallback to stdout if destination cannot be created
    return pino.destination(1);
  }
})();

const logger = pino(
  {
    level: process.env["PINO_LOG_LEVEL"] || "debug",
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      pid: process.pid,
      node_version: process.version,
    },
  },
  destination
);

export default logger;

/**
 * Forces the shared logger infrastructure to be initialized at the runtime boundary.
 *
 * @returns Nothing. The call exists to make logger bootstrap explicit at the application entrypoint.
 */
export function initializeLogger(): void {
  void logger;
}

/**
 * Creates a child logger for a stable module boundary.
 *
 * @param moduleName - Stable module identifier that will be attached to emitted log records.
 * @returns A child logger bound to the requested module name.
 */
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
