import { Buffer } from "node:buffer";
import { open, readFile } from "node:fs/promises";

import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  classifyInspectionContentState,
  INSPECTION_CONTENT_STATE_LITERALS,
  type InspectionContentStateClassification,
  type InspectionContentSampleWindowPosition,
} from "@domain/shared/search/inspection-content-state";

/**
 * Shared metadata surface required by the internal text-read SSOT.
 */
export interface TextReadCoreEntry {
  /**
   * Caller-facing path that must remain stable in error and response surfaces.
   */
  requestedPath: string;

  /**
   * Absolute validated filesystem path that may be read safely.
   */
  validPath: string;

  /**
   * Total byte size of the validated target file.
   */
  totalFileBytes: number;
}

/**
 * Shared result surface for validated inline full-text reads.
 */
export interface ReadValidatedFullTextFileResult {
  /**
   * UTF-8 text content returned after shared content-state validation succeeds.
   */
  content: string;

  /**
   * Raw byte count returned by the inline full-text read.
   */
  returnedByteCount: number;

  /**
   * Shared inspection-state classification that gated the successful text read.
   */
  classification: InspectionContentStateClassification;
}

interface SampleWindowSpec {
  position: InspectionContentSampleWindowPosition;
  startByte: number;
  byteCount: number;
}

function buildSampleWindowSpecs(totalFileBytes: number): SampleWindowSpec[] {
  const boundedWindowByteCount = Math.min(
    totalFileBytes,
    INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  );

  return [
    {
      position: "head",
      startByte: 0,
      byteCount: boundedWindowByteCount,
    },
    {
      position: "middle",
      startByte: Math.max(
        0,
        Math.floor(totalFileBytes / 2) - Math.floor(boundedWindowByteCount / 2),
      ),
      byteCount: boundedWindowByteCount,
    },
    {
      position: "tail",
      startByte: Math.max(0, totalFileBytes - boundedWindowByteCount),
      byteCount: boundedWindowByteCount,
    },
  ];
}

function getFullCoverageWindowPositions():
  readonly InspectionContentSampleWindowPosition[] {
  return INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS;
}

async function readSampleWindow(
  validPath: string,
  startByte: number,
  byteCount: number,
): Promise<Buffer> {
  const fileHandle = await open(validPath, "r");

  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, startByte);

    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

async function readBoundedInspectionContentSample(
  entry: TextReadCoreEntry,
): Promise<Uint8Array> {
  const sampledBuffers = await Promise.all(
    buildSampleWindowSpecs(entry.totalFileBytes).map(async (sampleWindow) =>
      readSampleWindow(
        entry.validPath,
        sampleWindow.startByte,
        sampleWindow.byteCount,
      ),
    ),
  );

  return Buffer.concat(sampledBuffers);
}

function createUnsupportedTextReadStateMessage(
  toolName: string,
  entry: Pick<TextReadCoreEntry, "requestedPath">,
  classification: InspectionContentStateClassification,
): string {
  switch (classification.resolvedState) {
    case INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT:
      return `${toolName} supports only text-compatible reads. '${entry.requestedPath}' was classified as ${classification.resolvedState}. ${classification.classificationReason}`;
    case INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE:
      return `${toolName} cannot confirm a text-compatible surface for '${entry.requestedPath}' from bounded sampling. ${classification.classificationReason}`;
    default:
      return `${toolName} cannot read '${entry.requestedPath}' as bounded UTF-8 text. ${classification.classificationReason}`;
  }
}

/**
 * Resolves the shared inspection-state classification used by text-read surfaces.
 *
 * @param entry - Validated path metadata for the candidate text-read surface.
 * @returns Shared content-state classification derived from bounded evidence.
 */
export async function resolveTextReadInspectionState(
  entry: TextReadCoreEntry,
): Promise<InspectionContentStateClassification> {
  if (entry.totalFileBytes <= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES) {
    const contentSample = await readFile(entry.validPath);

    return classifyInspectionContentState({
      candidatePath: entry.requestedPath,
      candidateFileBytes: entry.totalFileBytes,
      contentSample,
      sampledWindowPositions: getFullCoverageWindowPositions(),
    });
  }

  const contentSample = await readBoundedInspectionContentSample(entry);

  return classifyInspectionContentState({
    candidatePath: entry.requestedPath,
    candidateFileBytes: entry.totalFileBytes,
    contentSample,
    sampledWindowPositions: INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  });
}

/**
 * Rejects binary or unresolved large-surface states before text reads proceed.
 *
 * @param toolName - Exact public tool name that owns the read surface.
 * @param entry - Validated path metadata for the candidate text-read surface.
 * @param classification - Shared inspection-state classification for the candidate surface.
 */
export function assertSupportedTextReadSurface(
  toolName: string,
  entry: Pick<TextReadCoreEntry, "requestedPath">,
  classification: InspectionContentStateClassification,
): void {
  if (
    classification.resolvedState === INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT
    || classification.resolvedState
      === INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE
  ) {
    throw new Error(
      createUnsupportedTextReadStateMessage(toolName, entry, classification),
    );
  }
}

/**
 * Reads one validated file as bounded UTF-8 text after shared content-state validation succeeds.
 *
 * @param entry - Validated path metadata for the candidate text-read surface.
 * @param toolName - Exact public tool name that owns the read surface.
 * @param preResolvedState - Optional precomputed content-state classification to reuse.
 * @returns Shared inline full-text result with the gating classification attached.
 */
export async function readValidatedFullTextFile(
  entry: TextReadCoreEntry,
  toolName: string,
  preResolvedState?: InspectionContentStateClassification,
): Promise<ReadValidatedFullTextFileResult> {
  const classification = preResolvedState
    ?? await resolveTextReadInspectionState(entry);

  assertSupportedTextReadSurface(toolName, entry, classification);

  const contentBuffer = await readFile(entry.validPath);

  return {
    content: contentBuffer.toString("utf8"),
    returnedByteCount: contentBuffer.byteLength,
    classification,
  };
}

/**
 * Renders canonical line-numbered text output for bounded inline read surfaces.
 *
 * @param content - UTF-8 text content that should be rendered with 1-based line numbers.
 * @returns The content surface with one prefixed line number per line.
 */
export function formatLineNumberedTextContent(content: string): string {
  return content
    .split("\n")
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}
