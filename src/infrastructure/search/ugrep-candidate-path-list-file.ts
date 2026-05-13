import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Executes one callback with a temporary newline-delimited candidate-path manifest file.
 *
 * @remarks
 * Large ordered native-search batches may exceed comfortable process-argument sizes when every
 * candidate path is passed directly on the command line. This helper materializes the batch into a
 * temporary manifest file for `ugrep --from=...` while ensuring the file is always removed
 * afterward.
 *
 * @param candidatePaths - Ordered candidate paths that the native backend should consume.
 * @param callback - Async callback that receives the manifest file path.
 * @returns The callback result after the temporary manifest file is cleaned up.
 */
export async function withTemporaryUgrepCandidatePathListFile<T>(
  candidatePaths: readonly string[],
  callback: (candidatePathListFile: string) => Promise<T>,
): Promise<T> {
  if (candidatePaths.length === 0) {
    throw new Error(
      "withTemporaryUgrepCandidatePathListFile requires at least one candidate path.",
    );
  }

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "mcp-fs-ugrep-candidate-paths-"),
  );
  const candidatePathListFile = path.join(temporaryDirectory, "candidate-paths.txt");

  try {
    await writeFile(candidatePathListFile, `${candidatePaths.join("\n")}\n`, "utf8");

    return await callback(candidatePathListFile);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
