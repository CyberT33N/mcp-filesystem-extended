import { Buffer } from "node:buffer";
import path from "node:path";

import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
} from "@domain/shared/guardrails/tool-guardrail-limits";

/**
 * Canonical literal map for the shared inspection content-state taxonomy.
 */
export const INSPECTION_CONTENT_STATE_LITERALS = {
  BINARY_CONFIDENT: "BINARY_CONFIDENT",
  HYBRID_BINARY_DOMINANT: "HYBRID_BINARY_DOMINANT",
  HYBRID_TEXT_DOMINANT: "HYBRID_TEXT_DOMINANT",
  TEXT_CONFIDENT: "TEXT_CONFIDENT",
  UNKNOWN_LARGE_SURFACE: "UNKNOWN_LARGE_SURFACE",
} as const;

/**
 * Canonical literal map for supported text encodings in the shared inspection pipeline.
 */
export const INSPECTION_CONTENT_TEXT_ENCODING_LITERALS = {
  UTF16LE: "utf16le",
  UTF8: "utf8",
} as const;

/**
 * Supported text encodings that downstream text-oriented operations may consume.
 */
export type InspectionContentTextEncoding =
  (typeof INSPECTION_CONTENT_TEXT_ENCODING_LITERALS)[keyof typeof INSPECTION_CONTENT_TEXT_ENCODING_LITERALS];

/**
 * Canonical literal map for operation-capability routing.
 *
 * @remarks
 * See {@link ../../../../conventions/content-classification/operation-capability-matrix.md | Content Inspection Operation Capability Matrix}
 * for the architectural rules that govern these operation families.
 */
export const INSPECTION_CONTENT_OPERATION_LITERALS = {
  COUNT_LINES: "COUNT_LINES",
  READ_TEXT: "READ_TEXT",
  SEARCH_TEXT: "SEARCH_TEXT",
} as const;

/**
 * Shared operation families that consume the content-inspection state.
 */
export type InspectionContentOperation =
  (typeof INSPECTION_CONTENT_OPERATION_LITERALS)[keyof typeof INSPECTION_CONTENT_OPERATION_LITERALS];

/**
 * Shared operational content states used by inspection surfaces.
 */
export type InspectionContentState =
  (typeof INSPECTION_CONTENT_STATE_LITERALS)[keyof typeof INSPECTION_CONTENT_STATE_LITERALS];

/**
 * Canonical literal map for inspection-state confidence levels.
 */
export const INSPECTION_CONTENT_CONFIDENCE_LITERALS = {
  HIGH: "HIGH",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
} as const;

/**
 * Confidence levels attached to one inspection-state classification result.
 */
export type InspectionContentConfidence =
  (typeof INSPECTION_CONTENT_CONFIDENCE_LITERALS)[keyof typeof INSPECTION_CONTENT_CONFIDENCE_LITERALS];

/**
 * One canonical sample-window position used by bounded inspection-state sampling.
 */
export type InspectionContentSampleWindowPosition =
  (typeof INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS)[number];

/**
 * Input contract for inspection-state classification.
 */
export interface InspectionContentStateInput {
  /**
   * Candidate path that the inspection surface wants to classify.
   */
  candidatePath: string;

  /**
   * Optional total file size used for conservative large-surface handling.
   */
  candidateFileBytes?: number;

  /**
   * Optional sampled content used for bounded evidence-based classification.
   */
  contentSample?: Uint8Array;

  /**
   * Optional sample-window positions represented by the provided content sample.
   */
  sampledWindowPositions?: readonly InspectionContentSampleWindowPosition[];
}

/**
 * Explicit evidence surface attached to one inspection-state classification.
 */
export interface InspectionContentStateEvidence {
  /**
   * Indicates whether a text-oriented extension hint influenced the outcome.
   */
  usedTextExtensionHint: boolean;

  /**
   * Indicates whether a binary/container extension hint influenced the outcome.
   */
  usedBinaryExtensionHint: boolean;

  /**
   * Indicates whether sampled content influenced the outcome.
   */
  usedContentProbe: boolean;

  /**
   * Indicates whether explicit text-encoding detection contributed to the outcome.
   */
  usedEncodingDetection: boolean;

  /**
   * Sample-window positions represented by the current evidence surface.
   */
  sampledWindowPositions: readonly InspectionContentSampleWindowPosition[];

  /**
   * Total bytes represented by the sampled content surface.
   */
  sampledByteCount: number;

  /**
   * Canonical per-window byte budget for bounded content-state sampling.
   */
  sampleWindowByteBudget: number;

  /**
   * Raw NUL-byte count observed in the sampled content surface.
   */
  nulByteCount: number;

  /**
   * Optional total file size used to identify large ambiguous surfaces conservatively.
   */
  candidateFileBytes: number | null;
}

/**
 * Shared inspection-state classification result.
 */
export interface InspectionContentStateClassification {
  /**
   * Resolved inspection content state that later consumers may route on.
   */
  resolvedState: InspectionContentState;

  /**
   * Confidence level attached to the resolved state.
   */
  confidence: InspectionContentConfidence;

  /**
   * Resolved text encoding used for later text-oriented execution.
   */
  resolvedTextEncoding: InspectionContentTextEncoding;

  /**
   * Concise explanation of the decisive classification outcome.
   */
  classificationReason: string;

  /**
   * Explicit evidence surface that explains why the result was produced.
   */
  evidence: InspectionContentStateEvidence;
}

interface InspectionContentProbeAssessment {
  classificationReason: string;
  probeOutcome:
    | "BINARY_STRONG"
    | "BINARY_DOMINANT"
    | "TEXT_DOMINANT"
    | "TEXT_STRONG";
}

/**
 * Shared capability decision for one content-inspection operation.
 */
export interface InspectionContentOperationCapability {
  /**
   * Operation family being evaluated.
   */
  operation: InspectionContentOperation;

  /**
   * Indicates whether the current content state may execute the requested operation.
   */
  isAllowed: boolean;

  /**
   * Compact explanation of the resolved capability decision.
   */
  reason: string;

  /**
   * Indicates whether the caller should prefer a decoded-text fallback instead of the native
   * binary-skipping search lane.
   */
  requiresDecodedTextFallback: boolean;
}

const TEXT_EXTENSION_HINTS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".cjs",
  ".env",
  ".go",
  ".graphql",
  ".gql",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".kt",
  ".less",
  ".md",
  ".mdc",
  ".mjs",
  ".mts",
  ".properties",
  ".ps1",
  ".py",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const HARD_BINARY_EXTENSION_HINTS = new Set([
  ".7z",
  ".avi",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".rar",
  ".so",
  ".tar",
  ".ttf",
  ".war",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

function countControlBytes(sample: Uint8Array): number {
  let controlByteCount = 0;

  for (const value of sample) {
    const isAllowedWhitespace = value === 9 || value === 10 || value === 13;
    const isControlCharacter = value < 32;

    if (isControlCharacter && !isAllowedWhitespace) {
      controlByteCount += 1;
    }
  }

  return controlByteCount;
}

function countDecodedControlCharacters(decodedSample: string): number {
  let controlCharacterCount = 0;

  for (const character of decodedSample) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    const isAllowedWhitespace = codePoint === 9 || codePoint === 10 || codePoint === 13;
    const isControlCharacter = codePoint < 32 || codePoint === 127;

    if (isControlCharacter && !isAllowedWhitespace) {
      controlCharacterCount += 1;
    }
  }

  return controlCharacterCount;
}

function countTextCompatibleCharacters(decodedSample: string): number {
  let textCompatibleCharacterCount = 0;

  for (const character of decodedSample) {
    if (character === "�") {
      continue;
    }

    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    const isAllowedWhitespace = codePoint === 9 || codePoint === 10 || codePoint === 13;
    const isPrintableCharacter = codePoint >= 32;

    if (isAllowedWhitespace || isPrintableCharacter) {
      textCompatibleCharacterCount += 1;
    }
  }

  return textCompatibleCharacterCount;
}

function countOccurrences(sample: Uint8Array, target: number): number {
  let occurrenceCount = 0;

  for (const value of sample) {
    if (value === target) {
      occurrenceCount += 1;
    }
  }

  return occurrenceCount;
}

function isLikelyAsciiLikeByte(value: number): boolean {
  return value === 9 || value === 10 || value === 13 || (value >= 32 && value <= 126);
}

function hasUtf16LeBom(sample: Uint8Array): boolean {
  return sample.byteLength >= 2 && sample[0] === 0xff && sample[1] === 0xfe;
}

function isLikelyUtf16LeSample(sample: Uint8Array): boolean {
  if (sample.byteLength < 4) {
    return false;
  }

  const evenLength = sample.byteLength - sample.byteLength % 2;

  if (evenLength < 4) {
    return false;
  }

  let evenByteCount = 0;
  let oddByteCount = 0;
  let evenZeroByteCount = 0;
  let oddZeroByteCount = 0;
  let evenAsciiLikeByteCount = 0;

  for (let index = 0; index < evenLength; index += 2) {
    const evenByte = sample[index] ?? 0;
    const oddByte = sample[index + 1] ?? 0;

    evenByteCount += 1;
    oddByteCount += 1;

    if (evenByte === 0) {
      evenZeroByteCount += 1;
    }

    if (oddByte === 0) {
      oddZeroByteCount += 1;
    }

    if (isLikelyAsciiLikeByte(evenByte)) {
      evenAsciiLikeByteCount += 1;
    }
  }

  if (evenByteCount === 0 || oddByteCount === 0) {
    return false;
  }

  const oddZeroRatio = oddZeroByteCount / oddByteCount;
  const evenZeroRatio = evenZeroByteCount / evenByteCount;
  const evenAsciiLikeRatio = evenAsciiLikeByteCount / evenByteCount;

  return oddZeroRatio >= 0.3 && evenZeroRatio <= 0.05 && evenAsciiLikeRatio >= 0.6;
}

function resolveSampleTextEncoding(sample: Uint8Array): {
  resolvedTextEncoding: InspectionContentTextEncoding;
  usedEncodingDetection: boolean;
} {
  if (hasUtf16LeBom(sample) || isLikelyUtf16LeSample(sample)) {
    return {
      resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
      usedEncodingDetection: true,
    };
  }

  return {
    resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
    usedEncodingDetection: false,
  };
}

/**
 * Decodes sampled or full file bytes with one supported shared text encoding.
 *
 * @param contentBytes - Raw bytes that should be decoded into text.
 * @param textEncoding - Shared text encoding resolved by the inspection-state classifier.
 * @returns Decoded text that later read, search, and count surfaces may consume.
 */
export function decodeInspectionContentTextBytes(
  contentBytes: Uint8Array,
  textEncoding: InspectionContentTextEncoding,
): string {
  if (contentBytes.byteLength === 0) {
    return "";
  }

  if (textEncoding === INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE) {
    const evenByteLength = contentBytes.byteLength - contentBytes.byteLength % 2;

    return Buffer.from(contentBytes.subarray(0, evenByteLength)).toString("utf16le");
  }

  return Buffer.from(contentBytes).toString("utf8");
}

function resolveSampledWindowPositions(
  input: InspectionContentStateInput,
): readonly InspectionContentSampleWindowPosition[] {
  if (input.contentSample === undefined) {
    return [];
  }

  if (
    input.sampledWindowPositions !== undefined
    && input.sampledWindowPositions.length > 0
  ) {
    return input.sampledWindowPositions;
  }

  const [defaultWindowPosition] = INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS;

  return defaultWindowPosition === undefined ? [] : [defaultWindowPosition];
}

function createEvidence(
  input: InspectionContentStateInput,
  usedTextExtensionHint: boolean,
  usedBinaryExtensionHint: boolean,
  usedContentProbe: boolean,
  usedEncodingDetection: boolean,
): InspectionContentStateEvidence {
  return {
    candidateFileBytes: input.candidateFileBytes ?? null,
    nulByteCount: input.contentSample === undefined ? 0 : countOccurrences(input.contentSample, 0),
    sampleWindowByteBudget: INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
    sampledByteCount: input.contentSample?.byteLength ?? 0,
    sampledWindowPositions: resolveSampledWindowPositions(input),
    usedBinaryExtensionHint,
    usedContentProbe,
    usedEncodingDetection,
    usedTextExtensionHint,
  };
}

function createClassification(
  input: InspectionContentStateInput,
  resolvedState: InspectionContentState,
  confidence: InspectionContentConfidence,
  resolvedTextEncoding: InspectionContentTextEncoding,
  classificationReason: string,
  usedTextExtensionHint: boolean,
  usedBinaryExtensionHint: boolean,
  usedContentProbe: boolean,
  usedEncodingDetection: boolean,
): InspectionContentStateClassification {
  return {
    classificationReason,
    confidence,
    evidence: createEvidence(
      input,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      usedContentProbe,
      usedEncodingDetection,
    ),
    resolvedTextEncoding,
    resolvedState,
  };
}

function assessSampleTextCompatibility(
  sample: Uint8Array,
  textEncoding: InspectionContentTextEncoding,
): InspectionContentProbeAssessment {
  if (sample.byteLength === 0) {
    return {
      classificationReason: "Empty sampled content remained text-compatible.",
      probeOutcome: "TEXT_STRONG",
    };
  }

  const decodedSample = decodeInspectionContentTextBytes(sample, textEncoding);
  const decodedLength = decodedSample.length;
  const replacementCharacterCount = Array.from(decodedSample).filter(
    (character) => character === "�",
  ).length;
  const replacementCharacterRatio =
    decodedLength === 0 ? 0 : replacementCharacterCount / decodedLength;
  const decodedControlCharacterRatio =
    decodedLength === 0 ? 0 : countDecodedControlCharacters(decodedSample) / decodedLength;
  const textCompatibleCharacterRatio =
    decodedLength === 0 ? 1 : countTextCompatibleCharacters(decodedSample) / decodedLength;
  const rawNulByteRatio = countOccurrences(sample, 0) / sample.byteLength;
  const rawControlByteRatio = countControlBytes(sample) / sample.byteLength;

  if (textEncoding === INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8) {
    if (
      replacementCharacterRatio > 0.2
      || decodedControlCharacterRatio > 0.2
      || (rawNulByteRatio > 0.2 && textCompatibleCharacterRatio < 0.6)
    ) {
      return {
        classificationReason:
          "Bounded sampled evidence stayed strongly non-text-compatible under UTF-8 decoding.",
        probeOutcome: "BINARY_STRONG",
      };
    }

    if (
      replacementCharacterRatio > 0.05
      || decodedControlCharacterRatio > 0.1
      || rawControlByteRatio > 0.1
      || textCompatibleCharacterRatio < 0.65
    ) {
      return {
        classificationReason:
          "Bounded sampled evidence contained enough non-text-compatible signals to remain binary-dominant.",
        probeOutcome: "BINARY_DOMINANT",
      };
    }
  } else if (
    replacementCharacterRatio > 0.2
    || decodedControlCharacterRatio > 0.2
    || textCompatibleCharacterRatio < 0.6
  ) {
    return {
      classificationReason:
        "Decoded sampled content under the detected UTF-16 LE surface remained too unstable for text-oriented execution.",
      probeOutcome: "BINARY_STRONG",
    };
  }

  if (
    replacementCharacterRatio > 0.05
    || decodedControlCharacterRatio > 0.1
    || textCompatibleCharacterRatio < 0.65
  ) {
    return {
      classificationReason:
        "Decoded sampled content remained text-leaning but still carried enough noise to stay binary-dominant.",
      probeOutcome: "BINARY_DOMINANT",
    };
  }

  if (
    replacementCharacterRatio === 0
    && decodedControlCharacterRatio < 0.02
    && textCompatibleCharacterRatio > 0.92
  ) {
    return {
      classificationReason: "Bounded sampled content stayed strongly text-compatible.",
      probeOutcome: "TEXT_STRONG",
    };
  }

  return {
    classificationReason:
      "Bounded sampled content stayed text-compatible, but mixed evidence prevents a text-confident verdict.",
    probeOutcome: "TEXT_DOMINANT",
  };
}

function hasFullSamplingCoverage(
  sampledWindowPositions: readonly InspectionContentSampleWindowPosition[],
): boolean {
  return INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS.every((position) =>
    sampledWindowPositions.includes(position),
  );
}

/**
 * Resolves the canonical inspection content state for one candidate path.
 *
 * @param input - Candidate path plus optional file-size and sampled-content evidence.
 * @returns Shared inspection-state output with explicit confidence and evidence fields.
 */
export function classifyInspectionContentState(
  input: InspectionContentStateInput,
): InspectionContentStateClassification {
  const extension = path.extname(input.candidatePath).toLowerCase();
  const usedTextExtensionHint = TEXT_EXTENSION_HINTS.has(extension);
  const usedBinaryExtensionHint = HARD_BINARY_EXTENSION_HINTS.has(extension);

  if (usedBinaryExtensionHint) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      "A binary or container extension hint rejected the candidate surface conservatively.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      false,
      false,
    );
  }

  const isLargeSurface =
    input.candidateFileBytes !== undefined
    && input.candidateFileBytes >= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES;

  if (input.contentSample === undefined) {
    if (isLargeSurface) {
      return createClassification(
        input,
        INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE,
        INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
        INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
        "No bounded sampled evidence is available for a large candidate surface.",
        usedTextExtensionHint,
        usedBinaryExtensionHint,
        false,
        false,
      );
    }

    if (usedTextExtensionHint) {
      return createClassification(
        input,
        INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
        INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
        INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
        "A text-oriented extension hint exists, but bounded sampled evidence is still required before a text-confident decision can be made.",
        usedTextExtensionHint,
        usedBinaryExtensionHint,
        false,
        false,
      );
    }

    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      "No bounded sampled evidence is available for the candidate surface.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      false,
      false,
    );
  }

  const { resolvedTextEncoding, usedEncodingDetection } = resolveSampleTextEncoding(
    input.contentSample,
  );
  const probeAssessment = assessSampleTextCompatibility(
    input.contentSample,
    resolvedTextEncoding,
  );

  if (probeAssessment.probeOutcome === "BINARY_STRONG") {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
      resolvedTextEncoding,
      probeAssessment.classificationReason,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
      usedEncodingDetection,
    );
  }

  if (probeAssessment.probeOutcome === "BINARY_DOMINANT") {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_BINARY_DOMINANT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
      resolvedTextEncoding,
      probeAssessment.classificationReason,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
      usedEncodingDetection,
    );
  }

  const sampledWindowPositions = resolveSampledWindowPositions(input);
  const fullSamplingCoverage = hasFullSamplingCoverage(sampledWindowPositions);

  if (
    probeAssessment.probeOutcome === "TEXT_STRONG"
    && usedTextExtensionHint
    && (!isLargeSurface || fullSamplingCoverage)
  ) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
      resolvedTextEncoding,
      usedTextExtensionHint
        ? "Text-oriented extension hints and bounded sampled evidence agree on a text-confident surface."
        : probeAssessment.classificationReason,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
      usedEncodingDetection,
    );
  }

  if (isLargeSurface && !fullSamplingCoverage) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
      resolvedTextEncoding,
      "Bounded sampled evidence stayed text-compatible, but the large surface still lacks full shared sampling coverage and therefore remains hybrid text-dominant.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
      usedEncodingDetection,
    );
  }

  return createClassification(
    input,
    INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
    resolvedTextEncoding,
    probeAssessment.probeOutcome === "TEXT_STRONG"
      ? usedTextExtensionHint
        ? "Text-oriented extension hints and bounded sampled evidence agree on a text-compatible surface, but the result remains hybrid text-dominant because the evidence is not yet strong enough for a text-confident upgrade."
        : "Bounded sampled evidence stayed strongly text-compatible, but the current surface remains hybrid text-dominant without a canonical text extension hint."
      : probeAssessment.classificationReason,
    usedTextExtensionHint,
    usedBinaryExtensionHint,
    true,
    usedEncodingDetection,
  );
}

/**
 * Resolves whether one classified content state may execute one shared content-inspection
 * operation.
 *
 * @remarks
 * See {@link ../../../../conventions/content-classification/operation-capability-matrix.md | Content Inspection Operation Capability Matrix}
 * for the architectural contract that owns this decision surface.
 *
 * @param classification - Shared content-state classification that should be evaluated.
 * @param operation - Content-inspection operation family being requested.
 * @returns Shared capability decision for the requested operation.
 */
export function resolveInspectionContentOperationCapability(
  classification: Pick<InspectionContentStateClassification, "resolvedState" | "resolvedTextEncoding">,
  operation: InspectionContentOperation,
): InspectionContentOperationCapability {
  switch (classification.resolvedState) {
    case INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT:
      return {
        operation,
        isAllowed: true,
        reason: "The classified surface is text-confident for content-inspecting execution.",
        requiresDecodedTextFallback:
          operation === INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT
          && classification.resolvedTextEncoding
            !== INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      };
    case INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT:
      return {
        operation,
        isAllowed: true,
        reason:
          "The classified surface remains text-dominant enough for content-inspecting execution.",
        requiresDecodedTextFallback:
          operation === INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
      };
    case INSPECTION_CONTENT_STATE_LITERALS.HYBRID_BINARY_DOMINANT:
      return {
        operation,
        isAllowed: false,
        reason:
          "The classified surface remains binary-dominant, so text-oriented execution would be misleading.",
        requiresDecodedTextFallback: false,
      };
    case INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT:
      return {
        operation,
        isAllowed: false,
        reason: "The classified surface is binary-confident and therefore not eligible for text execution.",
        requiresDecodedTextFallback: false,
      };
    case INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE:
      return {
        operation,
        isAllowed: false,
        reason:
          "The classified surface still lacks enough bounded evidence for safe text-oriented execution.",
        requiresDecodedTextFallback: false,
      };
  }
}
