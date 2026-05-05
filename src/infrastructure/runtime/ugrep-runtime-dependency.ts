import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Environment variable that may pin the shell-free native `ugrep` executable path explicitly.
 */
const UGREP_EXECUTABLE_OVERRIDE_VARIABLE_NAME = "UGREP_EXECUTABLE_PATH";

/**
 * Canonical executable basename used when startup discovery resolves `ugrep` from process PATH.
 */
const UGREP_EXECUTABLE_BASENAME = "ugrep";

/**
 * Native Windows executable suffix required for shell-free `ugrep` process discovery.
 */
const WINDOWS_NATIVE_EXECUTABLE_EXTENSION = ".exe";

/**
 * Maximum startup probe duration for shell-free `ugrep --version` validation.
 */
const UGREP_STARTUP_PROBE_TIMEOUT_MS = 5000;

/**
 * Runtime options that shape startup resolution for the native `ugrep` dependency.
 */
export interface UgrepRuntimeDependencyResolutionOptions {
  /**
   * Optional environment surface used during startup dependency discovery.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Optional working directory used when a configured override path is relative.
   */
  cwd?: string;
}

/**
 * Startup-resolved runtime contract for the native `ugrep` dependency.
 */
export interface UgrepRuntimeDependency {
  /**
   * Absolute native executable path that shell-free search execution must launch.
   */
  executablePath: string;

  /**
   * Resolution source that produced the active executable path.
   */
  resolutionSource: "environment_override" | "process_path";
}

/**
 * Process-owned immutable runtime dependency captured during startup preflight.
 */
let activeUgrepRuntimeDependency: UgrepRuntimeDependency | null = null;

/**
 * Reads one environment variable with case-insensitive fallback for Windows-owned process surfaces.
 *
 * @param env - Environment surface inspected during runtime dependency discovery.
 * @param key - Canonical environment-variable name to resolve.
 * @returns The resolved environment value when present.
 */
function getEnvironmentValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const directValue = env[key];

  if (directValue !== undefined) {
    return directValue;
  }

  const normalizedKey = key.toLowerCase();

  for (const [environmentKey, environmentValue] of Object.entries(env)) {
    if (environmentKey.toLowerCase() === normalizedKey) {
      return environmentValue;
    }
  }

  return undefined;
}

/**
 * Normalizes one optional text value by trimming whitespace and collapsing empty strings.
 *
 * @param value - Optional text value read from environment or configuration surfaces.
 * @returns Normalized non-empty text or `null` when no usable value remains.
 */
function normalizeNonEmptyText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

/**
 * Normalizes one PATH entry by trimming whitespace and removing balanced outer quotes.
 *
 * @param pathEntry - Raw PATH segment emitted by the process environment.
 * @returns Normalized PATH segment suitable for executable-path construction.
 */
function normalizePathEntry(pathEntry: string): string {
  const trimmedEntry = pathEntry.trim();

  if (trimmedEntry.startsWith("\"") && trimmedEntry.endsWith("\"") && trimmedEntry.length >= 2) {
    return trimmedEntry.slice(1, -1);
  }

  return trimmedEntry;
}

/**
 * Resolves the ordered shell-free native `ugrep` candidate paths from the current process PATH.
 *
 * @param env - Environment surface inspected during startup dependency discovery.
 * @returns Unique candidate executable paths derived from the current process PATH.
 */
function resolveUgrepExecutableCandidates(env: NodeJS.ProcessEnv): string[] {
  const processPath = normalizeNonEmptyText(getEnvironmentValue(env, "PATH"));

  if (processPath === null) {
    return [];
  }

  const executableFileName = process.platform === "win32"
    ? `${UGREP_EXECUTABLE_BASENAME}${WINDOWS_NATIVE_EXECUTABLE_EXTENSION}`
    : UGREP_EXECUTABLE_BASENAME;
  const candidates = processPath
    .split(path.delimiter)
    .map(normalizePathEntry)
    .filter((pathEntry) => pathEntry !== "")
    .map((pathEntry) => path.join(pathEntry, executableFileName));

  return [...new Set(candidates)];
}

/**
 * Detects Windows shell-proxy executables that are incompatible with shell-free native launch.
 *
 * @param executablePath - Candidate executable path resolved during startup discovery.
 * @returns `true` when the candidate is a `.cmd` or `.bat` shell proxy.
 */
function isUnsupportedWindowsShellProxyExecutable(executablePath: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const executableExtension = path.extname(executablePath).toLowerCase();

  return executableExtension === ".cmd" || executableExtension === ".bat";
}

/**
 * Validates that one candidate path is a launchable shell-free native executable file.
 *
 * @param executablePath - Candidate executable path resolved from startup configuration or PATH.
 * @returns Absolute executable path when the candidate passed startup validation.
 */
async function assertReadableShellFreeExecutable(executablePath: string): Promise<string> {
  const absoluteExecutablePath = path.resolve(executablePath);

  if (isUnsupportedWindowsShellProxyExecutable(absoluteExecutablePath)) {
    throw new Error(
      `Configured executable '${absoluteExecutablePath}' is a shell proxy. The MCP native-search runtime requires a real shell-free executable such as ugrep.exe.`,
    );
  }

  await fs.access(absoluteExecutablePath, fsConstants.R_OK);

  const executableStats = await fs.stat(absoluteExecutablePath);

  if (!executableStats.isFile()) {
    throw new Error(
      `Configured executable '${absoluteExecutablePath}' is not a regular file.`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    let startupProbeSpawnError: string | null = null;
    let startupProbeStderr = "";
    let startupProbeTimedOut = false;
    const child = spawn(absoluteExecutablePath, ["--version"], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      startupProbeStderr += chunk.toString();
    });
    child.on("error", (error) => {
      startupProbeSpawnError = error.message;
    });

    const timeoutHandle = setTimeout(() => {
      startupProbeTimedOut = true;
      child.kill("SIGTERM");
    }, UGREP_STARTUP_PROBE_TIMEOUT_MS);

    child.on("close", (exitCode) => {
      clearTimeout(timeoutHandle);

      if (startupProbeTimedOut) {
        reject(
          new Error(
            `Configured executable '${absoluteExecutablePath}' did not complete startup probe '--version' within ${UGREP_STARTUP_PROBE_TIMEOUT_MS} ms.`,
          ),
        );
        return;
      }

      if (startupProbeSpawnError !== null) {
        reject(
          new Error(
            `Configured executable '${absoluteExecutablePath}' could not be launched shell-free. ${startupProbeSpawnError}`,
          ),
        );
        return;
      }

      if (exitCode !== 0) {
        const startupProbeFailureReason = startupProbeStderr.trim();

        reject(
          new Error(
            startupProbeFailureReason === ""
              ? `Configured executable '${absoluteExecutablePath}' failed startup probe '--version' with exit code ${exitCode}.`
              : `Configured executable '${absoluteExecutablePath}' failed startup probe '--version': ${startupProbeFailureReason}`,
          ),
        );
        return;
      }

      resolve();
    });
  });

  return absoluteExecutablePath;
}

/**
 * Attempts to validate one candidate executable path without surfacing a hard startup failure.
 *
 * @param executablePath - Candidate executable path resolved from the process PATH.
 * @returns The validated executable path or `null` when the candidate is unusable.
 */
async function tryResolveReadableShellFreeExecutable(executablePath: string): Promise<string | null> {
  try {
    return await assertReadableShellFreeExecutable(executablePath);
  } catch {
    return null;
  }
}

/**
 * Creates the canonical startup failure for unresolved native `ugrep` runtime dependency state.
 *
 * @returns Startup failure that explains the missing shell-free native executable resolution.
 */
function createMissingUgrepRuntimeDependencyError(): Error {
  return new Error(
    "Unable to resolve the required native 'ugrep' executable during MCP server startup. "
    + "Startup preflight searched the explicit override variable 'UGREP_EXECUTABLE_PATH' and the current process PATH but did not find a launchable shell-free executable. "
    + "Configure UGREP_EXECUTABLE_PATH with an absolute path to the native ugrep binary or start the MCP server process with a PATH that includes the ugrep installation directory.",
  );
}

/**
 * Creates the canonical startup failure for an invalid explicit `UGREP_EXECUTABLE_PATH` override.
 *
 * @param overridePath - Override path after working-directory normalization.
 * @param failureReason - Startup validation reason explaining why the override failed.
 * @returns Startup failure that preserves the explicit override path and validation reason.
 */
function createInvalidConfiguredUgrepOverrideError(overridePath: string, failureReason: string): Error {
  return new Error(
    `The configured native-search override '${UGREP_EXECUTABLE_OVERRIDE_VARIABLE_NAME}' resolved to '${overridePath}', but startup preflight could not use it. ${failureReason}`,
  );
}

/**
 * Resolves the native `ugrep` dependency for the current MCP server runtime.
 *
 * @remarks
 * The MCP search lanes run through shell-free child-process execution. Startup must therefore
 * resolve the actual native executable path before tool registration and request handling begin.
 *
 * @param options - Optional environment and working-directory inputs used during startup discovery.
 * @returns The absolute executable path that native search execution must use for this process.
 */
export async function resolveUgrepRuntimeDependency(
  options: UgrepRuntimeDependencyResolutionOptions = {},
): Promise<UgrepRuntimeDependency> {
  const environment = options.env ?? process.env;
  const workingDirectory = options.cwd ?? process.cwd();
  const configuredOverride = normalizeNonEmptyText(
    getEnvironmentValue(environment, UGREP_EXECUTABLE_OVERRIDE_VARIABLE_NAME),
  );

  if (configuredOverride !== null) {
    const configuredOverridePath = path.isAbsolute(configuredOverride)
      ? configuredOverride
      : path.resolve(workingDirectory, configuredOverride);

    try {
      return {
        executablePath: await assertReadableShellFreeExecutable(configuredOverridePath),
        resolutionSource: "environment_override",
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);

      throw createInvalidConfiguredUgrepOverrideError(configuredOverridePath, failureReason);
    }
  }

  for (const candidateExecutablePath of resolveUgrepExecutableCandidates(environment)) {
    const resolvedExecutablePath = await tryResolveReadableShellFreeExecutable(candidateExecutablePath);

    if (resolvedExecutablePath !== null) {
      return {
        executablePath: resolvedExecutablePath,
        resolutionSource: "process_path",
      };
    }
  }

  throw createMissingUgrepRuntimeDependencyError();
}

/**
 * Initializes the active process-owned `ugrep` runtime dependency once during server startup.
 *
 * @remarks
 * Repeated calls return the already resolved immutable runtime dependency for the active process.
 *
 * @param options - Optional environment and working-directory inputs used during startup discovery.
 * @returns The active startup-resolved `ugrep` runtime dependency for the current process.
 */
export async function initializeUgrepRuntimeDependency(
  options: UgrepRuntimeDependencyResolutionOptions = {},
): Promise<UgrepRuntimeDependency> {
  if (activeUgrepRuntimeDependency !== null) {
    return activeUgrepRuntimeDependency;
  }

  activeUgrepRuntimeDependency = await resolveUgrepRuntimeDependency(options);

  return activeUgrepRuntimeDependency;
}

/**
 * Returns the already initialized `ugrep` runtime dependency for the active process.
 *
 * @returns The startup-resolved runtime dependency used by shell-free native search execution.
 */
export function getUgrepRuntimeDependency(): UgrepRuntimeDependency {
  if (activeUgrepRuntimeDependency === null) {
    throw new Error(
      "The native 'ugrep' runtime dependency has not been initialized. MCP server startup must call initializeUgrepRuntimeDependency() before native search execution is reachable.",
    );
  }

  return activeUgrepRuntimeDependency;
}

/**
 * Returns the resolved shell-free executable path for the active `ugrep` runtime dependency.
 *
 * @returns Absolute executable path that later native search commands must launch.
 */
export function getRequiredUgrepExecutablePath(): string {
  return getUgrepRuntimeDependency().executablePath;
}
