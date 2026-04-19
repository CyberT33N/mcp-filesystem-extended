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
  HYBRID_SEARCHABLE: "HYBRID_SEARCHABLE",
  TEXT_CONFIDENT: "TEXT_CONFIDENT",
  UNKNOWN_LARGE_SURFACE: "UNKNOWN_LARGE_SURFACE",
} as const;

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
  indicatesBinary: boolean;
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
): InspectionContentStateEvidence {
  return {
    candidateFileBytes: input.candidateFileBytes ?? null,
    sampleWindowByteBudget: INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
    sampledByteCount: input.contentSample?.byteLength ?? 0,
    sampledWindowPositions: resolveSampledWindowPositions(input),
    usedBinaryExtensionHint,
    usedContentProbe,
    usedTextExtensionHint,
  };
}

function createClassification(
  input: InspectionContentStateInput,
  resolvedState: InspectionContentState,
  confidence: InspectionContentConfidence,
  classificationReason: string,
  usedTextExtensionHint: boolean,
  usedBinaryExtensionHint: boolean,
  usedContentProbe: boolean,
): InspectionContentStateClassification {
  return {
    classificationReason,
    confidence,
    evidence: createEvidence(
      input,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      usedContentProbe,
    ),
    resolvedState,
  };
}

function assessSampleForBinary(sample: Uint8Array): InspectionContentProbeAssessment {
  if (sample.byteLength === 0) {
    return {
      classificationReason: "Empty sampled content remained text-compatible.",
      indicatesBinary: false,
    };
  }

  if (sample.includes(0)) {
    return {
      classificationReason: "NUL-byte evidence rejected the sampled content as binary.",
      indicatesBinary: true,
    };
  }

  const decodedSample = Buffer.from(sample).toString("utf8");
  const decodedLength = decodedSample.length;

  if (decodedLength > 0) {
    const replacementCharacterCount = Array.from(decodedSample).filter(
      (character) => character === "�",
    ).length;

    if (replacementCharacterCount / decodedLength > 0.05) {
      return {
        classificationReason: "UTF-8 decoding confidence stayed too low for text-oriented execution.",
        indicatesBinary: true,
      };
    }
  }

  const controlByteRatio = countControlBytes(sample) / sample.byteLength;

  if (controlByteRatio > 0.1) {
    return {
      classificationReason: "Control-character density exceeded the conservative text threshold.",
      indicatesBinary: true,
    };
  }

  return {
    classificationReason: "Bounded sampled content stayed within conservative text thresholds.",
    indicatesBinary: false,
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
      "A binary or container extension hint rejected the candidate surface conservatively.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
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
        "No bounded sampled evidence is available for a large candidate surface.",
        usedTextExtensionHint,
        usedBinaryExtensionHint,
        false,
      );
    }

    if (usedTextExtensionHint) {
      return createClassification(
        input,
        INSPECTION_CONTENT_STATE_LITERALS.HYBRID_SEARCHABLE,
        INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
        "A text-oriented extension hint exists, but bounded sampled evidence is still required.",
        usedTextExtensionHint,
        usedBinaryExtensionHint,
        false,
      );
    }

    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
      "No bounded sampled evidence is available for the candidate surface.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      false,
    );
  }

  const probeAssessment = assessSampleForBinary(input.contentSample);

  if (probeAssessment.indicatesBinary) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
      probeAssessment.classificationReason,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
    );
  }

  const sampledWindowPositions = resolveSampledWindowPositions(input);
  const fullSamplingCoverage = hasFullSamplingCoverage(sampledWindowPositions);

  if (usedTextExtensionHint && (!isLargeSurface || fullSamplingCoverage)) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
      usedTextExtensionHint
        ? "Text-oriented extension hints and bounded sampled evidence agree on a text-confident surface."
        : probeAssessment.classificationReason,
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
    );
  }

  if (isLargeSurface) {
    return createClassification(
      input,
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_SEARCHABLE,
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
      "Bounded sampled evidence stayed text-compatible, but the large surface remains conservatively hybrid-searchable.",
      usedTextExtensionHint,
      usedBinaryExtensionHint,
      true,
    );
  }

  return createClassification(
    input,
    INSPECTION_CONTENT_STATE_LITERALS.HYBRID_SEARCHABLE,
    INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
    usedTextExtensionHint
      ? "Text-oriented extension hints require bounded sampled evidence; the current evidence supports a hybrid-searchable surface."
      : probeAssessment.classificationReason,
    usedTextExtensionHint,
    usedBinaryExtensionHint,
    true,
  );
}
