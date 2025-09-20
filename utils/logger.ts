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
    level: process.env.PINO_LOG_LEVEL || "debug",
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
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
