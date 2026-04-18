import path from "node:path";

/**
 * Input contract for the shared text-versus-binary eligibility classifier.
 */
export interface TextBinaryClassificationInput {
  /**
   * Candidate file-system path that later search or count work wants to inspect.
   */
  candidatePath: string;

  /**
   * Optional content sample used for conservative probe-based refinement.
   */
  contentSample?: Uint8Array;
}

/**
 * Shared classification result for text-eligible search surfaces.
 */
export interface TextBinaryClassification {
  /**
   * Indicates whether the candidate file remains eligible for text-oriented work.
   */
  isTextEligible: boolean;

  /**
   * Compact explanation of the decisive classification outcome.
   */
  classificationReason: string;

  /**
   * Indicates whether the small positive assist list influenced the outcome.
   */
  usedAssistList: boolean;

  /**
   * Indicates whether the generic content probe influenced the outcome.
   */
  usedContentProbe: boolean;
}

const TEXT_ASSIST_LIST = new Set([
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

const HARD_BINARY_OR_CONTAINER_CLASSES = new Set([
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

interface ContentProbeResult {
  isTextEligible: boolean;
  classificationReason: string;
}

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

function probeTextEligibility(sample: Uint8Array): ContentProbeResult {
  if (sample.byteLength === 0) {
    return {
      classificationReason: "Empty content sample stayed text-eligible.",
      isTextEligible: true,
    };
  }

  if (sample.includes(0)) {
    return {
      classificationReason: "NUL-byte content probe rejected the candidate as binary.",
      isTextEligible: false,
    };
  }

  const decodedSample = Buffer.from(sample).toString("utf8");
  const replacementCharacterCount = Array.from(decodedSample).filter(
    (character) => character === "�",
  ).length;

  if (replacementCharacterCount / decodedSample.length > 0.05) {
    return {
      classificationReason: "UTF-8 decoding confidence stayed too low for text execution.",
      isTextEligible: false,
    };
  }

  const controlByteRatio = countControlBytes(sample) / sample.byteLength;

  if (controlByteRatio > 0.1) {
    return {
      classificationReason: "Control-character density exceeded the conservative text threshold.",
      isTextEligible: false,
    };
  }

  return {
    classificationReason: "Content probe stayed within conservative text thresholds.",
    isTextEligible: true,
  };
}

/**
 * Classifies whether one candidate path is eligible for text-oriented search work.
 *
 * @remarks
 * The classifier combines a small positive assist list, explicit binary/container deny classes,
 * and a generic content probe so later search consumers avoid both exhaustive allow lists and
 * brittle extension-only routing.
 *
 * @param input - Candidate path and optional content sample for conservative classification.
 * @returns Shared classification output that later search and count handlers may consume.
 */
export function classifyTextBinarySurface(
  input: TextBinaryClassificationInput,
): TextBinaryClassification {
  const extension = path.extname(input.candidatePath).toLowerCase();
  const usedAssistList = TEXT_ASSIST_LIST.has(extension);

  if (HARD_BINARY_OR_CONTAINER_CLASSES.has(extension)) {
    return {
      classificationReason: "Explicit binary or container class rejected the candidate path.",
      isTextEligible: false,
      usedAssistList,
      usedContentProbe: false,
    };
  }

  if (input.contentSample === undefined) {
    if (usedAssistList) {
      return {
        classificationReason: "Text assist list matched, but a content probe is still required before text execution.",
        isTextEligible: false,
        usedAssistList,
        usedContentProbe: false,
      };
    }

    return {
      classificationReason: "Unknown file type requires a content probe before text execution.",
      isTextEligible: false,
      usedAssistList,
      usedContentProbe: false,
    };
  }

  const probeResult = probeTextEligibility(input.contentSample);

  if (!probeResult.isTextEligible) {
    return {
      classificationReason: probeResult.classificationReason,
      isTextEligible: false,
      usedAssistList,
      usedContentProbe: true,
    };
  }

  return {
    classificationReason: usedAssistList
      ? "Text assist list matched and the content probe stayed within conservative thresholds."
      : probeResult.classificationReason,
    isTextEligible: true,
    usedAssistList,
    usedContentProbe: true,
  };
}
