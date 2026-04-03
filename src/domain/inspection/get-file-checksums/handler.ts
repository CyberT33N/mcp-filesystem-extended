import { calculateFileHash, type HashAlgorithm } from "@infrastructure/filesystem/checksum.js";
import { validatePath } from "@infrastructure/filesystem/path-guard.js";

export interface FileChecksumEntry {
  path: string;
  hash: string;
}

export interface FileChecksumError {
  path: string;
  error: string;
}

export interface FileChecksumsResult {
  entries: FileChecksumEntry[];
  errors: FileChecksumError[];
}

export async function getFileChecksumsResult(
  filePaths: string[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[],
): Promise<FileChecksumsResult> {
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const hash = await calculateFileHash(validPath, algorithm);

        return {
          entry: {
            path: filePath,
            hash,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          error: {
            path: filePath,
            error: errorMessage,
          },
        };
      }
    }),
  );

  return {
    entries: results.flatMap((result) => (result.entry ? [result.entry] : [])),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}

export async function handleChecksumFiles(
  filePaths: string[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const result = await getFileChecksumsResult(filePaths, algorithm, allowedDirectories);

  // Format the results
  let output = `Checksums (${algorithm}):\n\n`;

  if (result.entries.length > 0) {
    for (const entry of result.entries) {
      output += `${entry.hash}  ${entry.path}\n`;
    }
  }

  if (result.errors.length > 0) {
    output += "\nErrors:\n";
    for (const error of result.errors) {
      output += `${error.path}: ${error.error}\n`;
    }
  }

  return output;
}
