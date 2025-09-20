import fs from "fs/promises";
import path from "path";
import os from 'os';
import { createModuleLogger } from "../utils/logger.js";

const log = createModuleLogger("helpers/path");

// Normalize all paths consistently
export function normalizePath(p: string): string {
  return path.normalize(p);
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security utilities
export async function validatePath(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  log.debug({ requestedPath, allowedDirectories }, "validatePath called");
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);
  log.debug({ absolute: normalizedRequested }, "validatePath normalized");

  // Check if path is within allowed directories (case-insensitive for Windows)
  const isAllowed = allowedDirectories.some(dir => 
    normalizedRequested.toLowerCase().startsWith(normalizePath(dir).toLowerCase())
  );
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => 
      normalizedReal.toLowerCase().startsWith(normalizePath(dir).toLowerCase())
    );
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    log.debug({ realPath }, "validatePath realpath allowed");
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => 
        normalizedParent.toLowerCase().startsWith(normalizePath(dir).toLowerCase())
      );
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      log.debug({ parentDir, realParentPath }, "validatePath parent exists");
      return absolute;
    } catch {
      log.error({ parentDir }, "validatePath parent missing");
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

/**
 * Validates a path intended for creation (files or directories) where some or all
 * segments may not yet exist. Ensures security by:
 * 1) verifying the requested absolute path is prefixed by an allowed directory, and
 * 2) validating the nearest existing ancestor's real path is within an allowed directory.
 */
export async function validatePathForCreation(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  log.debug({ requestedPath, allowedDirectories }, "validatePathForCreation called");
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);
  log.debug({ absolute: normalizedRequested }, "validatePathForCreation normalized");

  // Normalize allowed directories to absolute, normalized form
  const normalizedAllowed = allowedDirectories.map(dir => normalizePath(path.isAbsolute(dir) ? path.resolve(dir) : path.resolve(process.cwd(), dir)));
  log.debug({ normalizedAllowed }, "validatePathForCreation allowed normalized");

  // Quick prefix gate
  const isPrefixAllowed = normalizedAllowed.some(dir =>
    normalizedRequested.toLowerCase().startsWith(dir.toLowerCase())
  );
  if (!isPrefixAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Walk upwards to find nearest existing ancestor and validate it
  let current = normalizedRequested;
  while (true) {
    try {
      const stats = await fs.stat(current);
      const directoryToValidate = stats.isDirectory() ? current : path.dirname(current);
      const realExisting = await fs.realpath(directoryToValidate);
      const isRealAllowed = normalizedAllowed.some(dir =>
        normalizePath(realExisting).toLowerCase().startsWith(dir.toLowerCase())
      );
      if (!isRealAllowed) {
        throw new Error("Access denied - nearest existing ancestor outside allowed directories");
      }
      log.debug({ current, realExisting }, "validatePathForCreation ancestor validated");
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') {
        log.error({ current, code }, "validatePathForCreation stat error");
        throw err as Error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        log.error({ current }, "validatePathForCreation reached root without ancestor");
        throw new Error("Access denied - no existing ancestor found within allowed directories");
      }
      log.debug({ current, parent }, "validatePathForCreation ascend");
      current = parent;
    }
  }

  return normalizedRequested;
}