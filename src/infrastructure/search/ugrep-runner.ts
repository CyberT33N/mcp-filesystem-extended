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
 * Structured runtime result returned by the streaming `ugrep` runner.
 *
 * @remarks
 * The streaming surface carries no buffered stdout: lines are consumed by the caller's
 * line callback as they arrive, and the runner terminates the spawned process when the
 * consumer stops the stream.
 */
export interface UgrepStreamingSearchExecutionResult extends Omit<UgrepSearchExecutionResult, "stdout"> {
  /**
   * Indicates whether the runner terminated the spawned process because the line consumer
   * stopped the stream early.
   */
  terminatedEarly: boolean;
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

  /**
   * Executes one `ugrep` command plan in streaming mode: every completed stdout line is
   * delivered to the caller's line consumer as it arrives, and the spawned process is
   * terminated as soon as the consumer stops the stream.
   *
   * @remarks
   * The streaming surface exists so domain-owned total budgets are enforced by the domain
   * itself: the backend emits the raw truth and the consumer terminates the stream at the
   * budget boundary instead of delegating a per-file flag with divergent semantics.
   *
   * @param command - Structured native-search command plan produced by `buildUgrepCommand`.
   * @param onStdoutLine - Line consumer; returning `false` terminates the spawned process.
   * @returns Structured exit, stderr, and timing metadata without buffered stdout.
   */
  public async runSearchStreaming(
    command: UgrepCommand,
    onStdoutLine: (line: string) => boolean,
  ): Promise<UgrepStreamingSearchExecutionResult> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let stderr = "";
      let spawnErrorMessage: string | null = null;
      let timedOut = false;
      let terminatedEarly = false;
      let streamStopped = false;
      let pendingStdoutTail = "";

      const child = spawn(command.executable, command.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const stopStreaming = (): void => {
        streamStopped = true;
        terminatedEarly = true;
        child.kill(this.options.killSignal ?? "SIGTERM");
      };

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        if (streamStopped) {
          return;
        }

        pendingStdoutTail += chunk.toString();
        const lastNewlineIndex = pendingStdoutTail.lastIndexOf("\n");

        if (lastNewlineIndex < 0) {
          return;
        }

        const completedBlock = pendingStdoutTail.slice(0, lastNewlineIndex + 1);
        pendingStdoutTail = pendingStdoutTail.slice(lastNewlineIndex + 1);

        for (const completedLine of completedBlock.split(/\r?\n/u)) {
          if (completedLine === "") {
            continue;
          }

          if (!onStdoutLine(completedLine)) {
            stopStreaming();
            return;
          }
        }
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

        // A naturally completed stream flushes its final unterminated line; a stopped
        // stream drops its partial tail because the consumer already stopped at the budget.
        if (!streamStopped && pendingStdoutTail.trim() !== "") {
          onStdoutLine(pendingStdoutTail);
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
          syncCandidateBytesCap: command.syncCandidateBytesCap,
          terminatedEarly,
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

/**
 * Executes one structured `ugrep` command plan through the shared runner in streaming mode.
 *
 * @param command - Structured native-search command plan produced by `buildUgrepCommand`.
 * @param onStdoutLine - Line consumer; returning `false` terminates the spawned process.
 * @param options - Optional working-directory, environment, and timeout configuration.
 * @returns Structured exit, stderr, and timing metadata without buffered stdout.
 */
export async function runUgrepSearchStreaming(
  command: UgrepCommand,
  onStdoutLine: (line: string) => boolean,
  options?: UgrepRunnerOptions,
): Promise<UgrepStreamingSearchExecutionResult> {
  const runner = new UgrepRunner(options);

  return runner.runSearchStreaming(command, onStdoutLine);
}
