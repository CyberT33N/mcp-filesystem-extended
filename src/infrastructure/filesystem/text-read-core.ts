import { Buffer } from "node:buffer";
import { open, readFile } from "node:fs/promises";

import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  classifyInspectionContentState,
  decodeInspectionContentTextBytes,
  INSPECTION_CONTENT_OPERATION_LITERALS,
  INSPECTION_CONTENT_STATE_LITERALS,
  resolveInspectionContentOperationCapability,
  type InspectionContentStateClassification,
  type InspectionContentSampleWindowPosition,
  type InspectionContentTextEncoding,
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
   * Decoded text content returned after shared content-state validation succeeds.
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

/**
 * Shared bounded inspection sample returned by the infrastructure sampling SSOT.
 */
export interface SharedInspectionContentSample {
  /**
   * Raw sampled bytes used by the shared domain classifier.
   */
  contentSample: Uint8Array;

  /**
   * Canonical sample-window positions represented by the sampled bytes.
   */
  sampledWindowPositions: readonly InspectionContentSampleWindowPosition[];
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

/**
 * Reads the shared inspection sample for one validated file surface.
 *
 * @remarks
 * See {@link ../../../../conventions/content-classification/overview.md | Content Classification Architecture Overview}
 * for the shared sampling contract that requires complete small-surface evidence and bounded
 * head/middle/tail evidence for large surfaces.
 *
 * @param validPath - Absolute validated filesystem path that may be read safely.
 * @param totalFileBytes - Total byte size of the validated target file.
 * @returns Shared bounded inspection sample and the canonical sampled window positions.
 */
export async function readSharedInspectionContentSample(
  validPath: string,
  totalFileBytes: number,
): Promise<SharedInspectionContentSample> {
  if (totalFileBytes <= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES) {
    return {
      contentSample: await readFile(validPath),
      sampledWindowPositions: getFullCoverageWindowPositions(),
    };
  }

  return {
    contentSample: await readBoundedInspectionContentSample({
      requestedPath: validPath,
      totalFileBytes,
      validPath,
    }),
    sampledWindowPositions: INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  };
}

/**
 * Reads and decodes one validated file through the shared inspection text encoding.
 *
 * @param validPath - Absolute validated filesystem path that may be read safely.
 * @param textEncoding - Shared text encoding resolved by the inspection classifier.
 * @returns Decoded text content together with the raw returned byte count.
 */
export async function readDecodedInspectionTextFile(
  validPath: string,
  textEncoding: InspectionContentTextEncoding,
): Promise<{ content: string; returnedByteCount: number }> {
  const contentBuffer = await readFile(validPath);

  return {
    content: decodeInspectionContentTextBytes(contentBuffer, textEncoding),
    returnedByteCount: contentBuffer.byteLength,
  };
}

function createUnsupportedTextReadStateMessage(
  toolName: string,
  entry: Pick<TextReadCoreEntry, "requestedPath">,
  classification: InspectionContentStateClassification,
): string {
  const capability = resolveInspectionContentOperationCapability(
    classification,
    INSPECTION_CONTENT_OPERATION_LITERALS.READ_TEXT,
  );

  switch (classification.resolvedState) {
    case INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT:
      return `${toolName} supports only text-compatible reads. '${entry.requestedPath}' was classified as ${classification.resolvedState}. ${classification.classificationReason}`;
    case INSPECTION_CONTENT_STATE_LITERALS.HYBRID_BINARY_DOMINANT:
      return `${toolName} cannot read '${entry.requestedPath}' as decoded text because the sampled surface is binary-dominant. ${capability.reason}`;
    case INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE:
      return `${toolName} cannot confirm a text-compatible surface for '${entry.requestedPath}' from bounded sampling. ${classification.classificationReason}`;
    default:
      return `${toolName} cannot read '${entry.requestedPath}' as bounded decoded text. ${capability.reason}`;
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
  const sharedInspectionSample = await readSharedInspectionContentSample(
    entry.validPath,
    entry.totalFileBytes,
  );

  return classifyInspectionContentState({
    candidatePath: entry.requestedPath,
    candidateFileBytes: entry.totalFileBytes,
    contentSample: sharedInspectionSample.contentSample,
    sampledWindowPositions: sharedInspectionSample.sampledWindowPositions,
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
  const capability = resolveInspectionContentOperationCapability(
    classification,
    INSPECTION_CONTENT_OPERATION_LITERALS.READ_TEXT,
  );

  if (!capability.isAllowed) {
    throw new Error(
      createUnsupportedTextReadStateMessage(toolName, entry, classification),
    );
  }
}

/**
 * Reads one validated file as bounded decoded text after shared content-state validation succeeds.
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

  const decodedTextFile = await readDecodedInspectionTextFile(
    entry.validPath,
    classification.resolvedTextEncoding,
  );

  return {
    content: decodedTextFile.content,
    returnedByteCount: decodedTextFile.returnedByteCount,
    classification,
  };
}

/**
 * Renders canonical line-numbered text output for bounded inline read surfaces.
 *
 * @param content - Decoded text content that should be rendered with line numbers.
 * @param startLine - One-based absolute line number for the first line of the content surface.
 * Defaults to `1` for full-file reads. Pass the `startLine` value from a bounded read result
 * to produce absolute file-position prefixes instead of window-relative offsets.
 * @returns The content surface with one prefixed absolute line number per line.
 */
export function formatLineNumberedTextContent(content: string, startLine: number = 1): string {
  return content
    .split("\n")
    .map((line, index) => `${startLine + index}: ${line}`)
    .join("\n");
}
