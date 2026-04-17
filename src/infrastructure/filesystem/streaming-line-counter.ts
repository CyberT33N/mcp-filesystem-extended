import { createReadStream } from "node:fs";

/**
 * Optional settings for streaming line counting.
 *
 * @remarks
 * The counter keeps its default text-decoding surface intentionally small so
 * later handlers can reuse the same streaming helper without inventing
 * endpoint-local file-reading behavior.
 */
export interface StreamingLineCounterOptions {
  /**
   * Whether blank lines should be excluded from totals.
   */
  ignoreEmptyLines?: boolean;

  /**
   * Text encoding used for the streamed file surface.
   */
  encoding?: BufferEncoding;
}

async function countStreamedLines(
  filePath: string,
  options: StreamingLineCounterOptions,
  matchesLine?: (line: string) => boolean | Promise<boolean>,
): Promise<{ matchingLines: number; totalLines: number }> {
  const inputStream = createReadStream(filePath, {
    encoding: options.encoding ?? "utf8",
  });
  let bufferedText = "";
  let matchingLines = 0;
  let totalLines = 0;

  const processLine = async (line: string): Promise<void> => {
    if (options.ignoreEmptyLines === true && line.trim() === "") {
      return;
    }

    totalLines += 1;

    if (matchesLine !== undefined && await matchesLine(line)) {
      matchingLines += 1;
    }
  };

  try {
    for await (const chunk of inputStream) {
      bufferedText += chunk;

      let lineStartIndex = 0;
      let newlineIndex = bufferedText.indexOf("\n", lineStartIndex);

      while (newlineIndex !== -1) {
        let line = bufferedText.slice(lineStartIndex, newlineIndex);

        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }

        await processLine(line);
        lineStartIndex = newlineIndex + 1;
        newlineIndex = bufferedText.indexOf("\n", lineStartIndex);
      }

      bufferedText = bufferedText.slice(lineStartIndex);
    }

    if (bufferedText.endsWith("\r")) {
      bufferedText = bufferedText.slice(0, -1);
    }

    await processLine(bufferedText);

    return {
      matchingLines,
      totalLines,
    };
  } finally {
    inputStream.destroy();
  }
}

/**
 * Counts total lines in one file without loading the full file into memory.
 *
 * @remarks
 * This helper preserves the existing `split("\n")` counting semantics, which
 * means a trailing newline still contributes one final empty line unless empty
 * lines are explicitly ignored.
 *
 * @param filePath - Concrete file path whose total lines should be counted.
 * @param options - Optional blank-line and text-decoding settings.
 * @returns The streamed total-line count for the file.
 */
export async function countTotalLinesInFile(
  filePath: string,
  options: StreamingLineCounterOptions = {},
): Promise<number> {
  const result = await countStreamedLines(filePath, options);

  return result.totalLines;
}

/**
 * Counts matching lines in one file without loading the full file into memory.
 *
 * @remarks
 * Pattern-aware count handlers can supply a caller-owned predicate here when a
 * streaming match surface is still useful. The helper keeps the same newline
 * semantics as the total-line counter so both paths stay aligned.
 *
 * @param filePath - Concrete file path whose matching lines should be counted.
 * @param matchesLine - Caller-owned predicate that decides whether a streamed line matches.
 * @param options - Optional blank-line and text-decoding settings.
 * @returns The streamed matching-line count for the file.
 */
export async function countMatchingLinesInFile(
  filePath: string,
  matchesLine: (line: string) => boolean | Promise<boolean>,
  options: StreamingLineCounterOptions = {},
): Promise<number> {
  const result = await countStreamedLines(filePath, options, matchesLine);

  return result.matchingLines;
}
