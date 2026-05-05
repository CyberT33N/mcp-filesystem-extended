import { spawn } from "node:child_process";

import type { UgrepCommand } from "@infrastructure/search/ugrep-command-builder";

/**
 * Optional runtime settings for `ugrep` execution.
 */
export interface UgrepRunnerOptions {
  /**
   * Optional working directory for the native search process.
   */
  cwd?: string;

  /**
   * Optional environment surface passed to the native search process.
   */
  env?: NodeJS.ProcessEnv;

  /**
   * Optional timeout in milliseconds for the spawned process.
   */
  timeoutMs?: number;

  /**
   * Signal or numeric code used when a timeout forces termination.
   */
  killSignal?: NodeJS.Signals | number;
}

/**
 * Structured runtime result returned by the shared `ugrep` runner.
 */
export interface UgrepSearchExecutionResult {
  /**
   * Executable that the runner attempted to launch.
   */
  executable: string;

  /**
   * Exact argument vector passed to the executable.
   */
  args: string[];

  /**
   * Exit code reported by the spawned process.
   */
  exitCode: number | null;

  /**
   * Termination signal reported by the spawned process.
   */
  signal: NodeJS.Signals | null;

  /**
   * Captured standard-output text.
   */
  stdout: string;

  /**
   * Captured standard-error text.
   */
  stderr: string;

  /**
   * Lightweight wall-clock duration in milliseconds.
   */
  durationMs: number;

  /**
   * Indicates whether the process was terminated because of the configured timeout.
   */
  timedOut: boolean;

  /**
   * Spawn-time error message when the process could not start cleanly.
   */
  spawnErrorMessage: string | null;

  /**
   * Builder-derived indication that the execution used the fixed-string fast path.
   */
  fixedStringMode: boolean;

  /**
   * Builder-derived indication that the execution required a PCRE2-capable lane.
   */
  requiresPcre2: boolean;

  /**
   * Policy-derived synchronous candidate-byte cap associated with this run.
   */
  syncCandidateBytesCap: number;
}

/**
 * Shared runner for shell-free `ugrep` execution.
 *
 * @remarks
 * This runner is the single backend execution surface for later native-search consumers. It keeps
 * stdout, stderr, exit metadata, and timing together in one structured result so later handlers do
 * not need to interpret raw child-process results or invent endpoint-local shell integrations.
 */
export class UgrepRunner {
  /**
   * Creates one `ugrep` runner with optional process-level execution settings.
   *
   * @param options - Optional working-directory, environment, and timeout configuration.
   */
  public constructor(
    private readonly options: UgrepRunnerOptions = {},
  ) {}

  /**
   * Executes one pre-built `ugrep` command plan and returns structured execution metadata.
   *
   * @param command - Structured native-search command plan produced by `buildUgrepCommand`.
   * @returns Structured stdout, stderr, exit, and timing metadata.
   */
  public async runSearch(command: UgrepCommand): Promise<UgrepSearchExecutionResult> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let spawnErrorMessage: string | null = null;
      let timedOut = false;

      const child = spawn(command.executable, command.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        spawnErrorMessage = error.message;
      });

      const timeoutHandle = this.options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill(this.options.killSignal ?? "SIGTERM");
          }, this.options.timeoutMs);

      child.on("close", (exitCode, signal) => {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }

        resolve({
          args: [...command.args],
          durationMs: Date.now() - startedAt,
          executable: command.executable,
          exitCode,
          fixedStringMode: command.fixedStringMode,
          requiresPcre2: command.requiresPcre2,
          signal,
          spawnErrorMessage,
          stderr,
          stdout,
          syncCandidateBytesCap: command.syncCandidateBytesCap,
          timedOut,
        });
      });
    });
  }
}

/**
 * Formats the canonical caller-visible failure text for `ugrep` process-start errors.
 *
 * @param result - Structured native-search execution result that captured the launch failure.
 * @returns Caller-visible launch-failure text that includes the resolved executable path.
 */
export function formatUgrepSpawnFailure(
  result: Pick<UgrepSearchExecutionResult, "executable" | "spawnErrorMessage">,
): string {
  if (result.spawnErrorMessage === null) {
    throw new Error("formatUgrepSpawnFailure requires a captured spawnErrorMessage.");
  }

  return `Native search runner failed to start for executable '${result.executable}': ${result.spawnErrorMessage}`;
}

/**
 * Executes one structured `ugrep` command plan through the shared runner.
 *
 * @param command - Structured native-search command plan produced by `buildUgrepCommand`.
 * @param options - Optional working-directory, environment, and timeout configuration.
 * @returns Structured stdout, stderr, exit, and timing metadata.
 */
export async function runUgrepSearch(
  command: UgrepCommand,
  options?: UgrepRunnerOptions,
): Promise<UgrepSearchExecutionResult> {
  const runner = new UgrepRunner(options);

  return runner.runSearch(command);
}
