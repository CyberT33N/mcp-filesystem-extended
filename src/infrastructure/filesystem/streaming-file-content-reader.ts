import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";

const READ_FILE_CONTENT_CURSOR_PREFIX = "cursor:";

/**
 * Request contract for bounded line-range reads.
 */
export interface ReadFileContentLineRangeRequest {
  /**
   * Absolute validated filesystem path that may be read safely.
   */
  validPath: string;

  /**
   * One-based line number at which the bounded read begins.
   */
  startLine: number;

  /**
   * Maximum number of lines to return.
   */
  lineCount: number;
}

/**
 * Result contract for bounded line-range reads.
 */
export interface ReadFileContentLineRangeResult {
  /**
   * Joined UTF-8 content returned for the requested line window.
   */
  content: string;

  /**
   * First returned one-based line number.
   */
  startLine: number;

  /**
   * Final returned one-based line number.
   */
  endLine: number;

  /**
   * Number of lines that were returned.
   */
  returnedLineCount: number;

  /**
   * Returned UTF-8 byte count for the emitted content surface.
   */
  returnedByteCount: number;

  /**
   * Indicates whether more lines remain after the returned window.
   */
  hasMore: boolean;

  /**
   * First unread one-based line number when additional lines remain.
   */
  nextLine: number | null;
}

/**
 * Request contract for bounded byte-range reads.
 */
export interface ReadFileContentByteRangeRequest {
  /**
   * Absolute validated filesystem path that may be read safely.
   */
  validPath: string;

  /**
   * Total byte size of the validated target file.
   */
  totalFileBytes: number;

  /**
   * Zero-based byte offset at which the bounded read begins.
   */
  startByte: number;

  /**
   * Maximum number of bytes to read.
   */
  byteCount: number;
}

/**
 * Result contract for bounded byte-range reads.
 */
export interface ReadFileContentByteRangeResult {
  /**
   * Joined UTF-8 content returned for the requested byte window.
   */
  content: string;

  /**
   * Returned UTF-8 byte count for the emitted content surface.
   */
  returnedByteCount: number;

  /**
   * Zero-based starting byte offset for the returned window.
   */
  startByte: number;

  /**
   * Exclusive end offset of the returned byte window.
   */
  endByteExclusive: number;

  /**
   * Indicates whether unread bytes remain after the returned window.
   */
  hasMore: boolean;

  /**
   * First unread byte offset when additional bytes remain.
   */
  nextByteOffset: number | null;
}

/**
 * Request contract for cursor-based chunk reads.
 */
export interface ReadFileContentChunkCursorRequest {
  /**
   * Absolute validated filesystem path that may be read safely.
   */
  validPath: string;

  /**
   * Total byte size of the validated target file.
   */
  totalFileBytes: number;

  /**
   * Opaque continuation cursor returned by a previous chunk read, or null for the first chunk.
   */
  cursor: string | null;

  /**
   * Maximum number of bytes to read in the next chunk.
   */
  byteCount: number;
}

/**
 * Result contract for cursor-based chunk reads.
 */
export interface ReadFileContentChunkCursorResult {
  /**
   * Joined UTF-8 content returned for the requested chunk.
   */
  content: string;

  /**
   * Returned UTF-8 byte count for the emitted content surface.
   */
  returnedByteCount: number;

  /**
   * Cursor that identified the current chunk request.
   */
  cursor: string | null;

  /**
   * Opaque continuation cursor for the next chunk, or null at EOF.
   */
  nextCursor: string | null;

  /**
   * Zero-based starting byte offset for the returned chunk.
   */
  startByte: number;

  /**
   * Exclusive end offset of the returned chunk.
   */
  endByteExclusive: number;

  /**
   * Indicates whether unread bytes remain after the returned chunk.
   */
  hasMore: boolean;
}

function createReadFileContentCursor(nextByteOffset: number): string {
  return `${READ_FILE_CONTENT_CURSOR_PREFIX}${nextByteOffset}`;
}

function parseReadFileContentCursor(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }

  if (!cursor.startsWith(READ_FILE_CONTENT_CURSOR_PREFIX)) {
    throw new Error("Chunk cursor is invalid because it does not use the expected cursor prefix.");
  }

  const rawOffset = cursor.slice(READ_FILE_CONTENT_CURSOR_PREFIX.length);

  if (!/^\d+$/.test(rawOffset)) {
    throw new Error("Chunk cursor is invalid because the encoded byte offset is not numeric.");
  }

  return Number.parseInt(rawOffset, 10);
}

async function readByteWindow(
  validPath: string,
  startByte: number,
  byteCount: number,
): Promise<{ content: string; returnedByteCount: number }> {
  const fileHandle = await open(validPath, "r");

  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, startByte);
    const content = buffer.subarray(0, bytesRead).toString("utf8");

    return {
      content,
      returnedByteCount: bytesRead,
    };
  } finally {
    await fileHandle.close();
  }
}

/**
 * Reads one bounded line-range window through a streaming line reader.
 *
 * @param request - Validated line-range request parameters.
 * @returns One bounded line-range result with explicit continuation metadata.
 */
export async function readFileContentLineRange(
  request: ReadFileContentLineRangeRequest,
): Promise<ReadFileContentLineRangeResult> {
  const lastRequestedLine = request.startLine + request.lineCount - 1;
  const returnedLines: string[] = [];
  let currentLine = 0;
  let hasMore = false;

  const stream = createReadStream(request.validPath, { encoding: "utf8" });
  const lineReader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lineReader) {
      currentLine += 1;

      if (currentLine < request.startLine) {
        continue;
      }

      if (currentLine > lastRequestedLine) {
        hasMore = true;
        lineReader.close();
        stream.destroy();
        break;
      }

      returnedLines.push(line);
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }

  const content = returnedLines.join("\n");
  const returnedLineCount = returnedLines.length;
  const endLine = returnedLineCount === 0
    ? request.startLine - 1
    : request.startLine + returnedLineCount - 1;

  return {
    content,
    startLine: request.startLine,
    endLine,
    returnedLineCount,
    returnedByteCount: Buffer.byteLength(content, "utf8"),
    hasMore,
    nextLine: hasMore ? endLine + 1 : null,
  };
}

/**
 * Reads one bounded byte-range window without materializing the full file.
 *
 * @param request - Validated byte-range request parameters.
 * @returns One bounded byte-range result with explicit continuation metadata.
 */
export async function readFileContentByteRange(
  request: ReadFileContentByteRangeRequest,
): Promise<ReadFileContentByteRangeResult> {
  const { content, returnedByteCount } = await readByteWindow(
    request.validPath,
    request.startByte,
    request.byteCount,
  );
  const endByteExclusive = request.startByte + returnedByteCount;
  const hasMore = endByteExclusive < request.totalFileBytes;

  return {
    content,
    returnedByteCount,
    startByte: request.startByte,
    endByteExclusive,
    hasMore,
    nextByteOffset: hasMore ? endByteExclusive : null,
  };
}

/**
 * Reads one bounded cursor chunk without materializing the full file.
 *
 * @param request - Validated chunk-cursor request parameters.
 * @returns One cursor chunk result with an opaque continuation cursor.
 */
export async function readFileContentChunkCursor(
  request: ReadFileContentChunkCursorRequest,
): Promise<ReadFileContentChunkCursorResult> {
  const startByte = parseReadFileContentCursor(request.cursor);
  const { content, returnedByteCount } = await readByteWindow(
    request.validPath,
    startByte,
    request.byteCount,
  );
  const endByteExclusive = startByte + returnedByteCount;
  const hasMore = endByteExclusive < request.totalFileBytes;

  return {
    content,
    returnedByteCount,
    cursor: request.cursor,
    nextCursor: hasMore ? createReadFileContentCursor(endByteExclusive) : null,
    startByte,
    endByteExclusive,
    hasMore,
  };
}
