import pino from "pino";
import os from "os";
import path from "path";
import fs from "fs";

const DIAGNOSTIC_LOG_ROOT_DIRECTORY_NAME = "mcp-filesystem-extended";
const DIAGNOSTIC_LOG_DIRECTORY_NAME = "diagnostics";
const DIAGNOSTIC_LOG_FILE_NAME = "mcp-filesystem-extended-logs.txt";

/**
 * Stable root directory for cross-platform diagnostics log output.
 *
 * @remarks
 * This path is intentionally derived from `os.tmpdir()` instead of `process.cwd()` so the active
 * MCP server process always writes into one deterministic per-machine temporary diagnostics area
 * regardless of which working directory launched the server.
 */
export const DIAGNOSTIC_LOG_ROOT_PATH = path.join(
  os.tmpdir(),
  DIAGNOSTIC_LOG_ROOT_DIRECTORY_NAME,
);

/**
 * Stable diagnostics log directory shared by all runtime logger instances on the same machine.
 */
export const DIAGNOSTIC_LOG_DIRECTORY_PATH = path.join(
  DIAGNOSTIC_LOG_ROOT_PATH,
  DIAGNOSTIC_LOG_DIRECTORY_NAME,
);

/**
 * Stable diagnostics log file path used by the MCP server runtime.
 */
export const DIAGNOSTIC_LOG_FILE_PATH = path.join(
  DIAGNOSTIC_LOG_DIRECTORY_PATH,
  DIAGNOSTIC_LOG_FILE_NAME,
);

// Ensure the diagnostics directory exists synchronously before creating the logger.
try {
  if (!fs.existsSync(DIAGNOSTIC_LOG_DIRECTORY_PATH)) {
    fs.mkdirSync(DIAGNOSTIC_LOG_DIRECTORY_PATH, { recursive: true });
  }
} catch {
  // If the diagnostics directory cannot be created, fallback to stdout.
}

/**
 * Truncates the active log file at startup so each server process begins with a clean log surface.
 *
 * @remarks
 * Called once at server startup before the Pino destination is opened. Errors are silently swallowed
 * so a non-writable log path never blocks the server from starting.
 */
function truncateLogFileOnStartup(): void {
  try {
    fs.writeFileSync(DIAGNOSTIC_LOG_FILE_PATH, "", { flag: "w" });
  } catch {
    // Silently ignore — log rotation failure must never block server startup.
  }
}

let logFileInitialized = false;

const destination = (() => {
  try {
    return pino.destination({ dest: DIAGNOSTIC_LOG_FILE_PATH, sync: false });
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
  if (!logFileInitialized) {
    truncateLogFileOnStartup();
    logFileInitialized = true;
  }

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
