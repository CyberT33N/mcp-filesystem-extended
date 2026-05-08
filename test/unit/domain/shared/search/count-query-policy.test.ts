import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hoisted native-search executable mock used by count-query-policy tests.
 */
const { mockedGetRequiredUgrepExecutablePath } = vi.hoisted(() => ({
  mockedGetRequiredUgrepExecutablePath: vi.fn(() => "C:/tools/ugrep.exe"),
}));

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getRequiredUgrepExecutablePath: mockedGetRequiredUgrepExecutablePath,
}));

import {
  buildPatternAwareCountCommand,
  CountQueryExecutionLane,
  resolveCountQueryPolicy,
} from "@domain/shared/search/count-query-policy";
import {
  INSPECTION_CONTENT_STATE_LITERALS,
  INSPECTION_CONTENT_TEXT_ENCODING_LITERALS,
} from "@domain/shared/search/inspection-content-state";
import {
  PATTERN_CLASSIFICATION_LITERALS,
} from "@domain/shared/search/pattern-classifier";
import { PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

describe("count query policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the streaming total-only lane for text-eligible requests without a pattern", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      },
      pattern: undefined,
    });

    expect(policy.executionLane).toBe(CountQueryExecutionLane.STREAMING_TOTAL_ONLY);
    expect(policy.patternClassification).toBeNull();
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.taskRecommendedAfterSeconds).toBe(60);
    expect(policy.syncCandidateBytesCap).toBeNull();
    expect(policy.serviceHardGapBytes).toBeNull();
  });

  it("rejects total-only line counting on binary-confident surfaces", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      },
      pattern: undefined,
    });

    expect(policy.executionLane).toBe(CountQueryExecutionLane.UNSUPPORTED_STATE);
    expect(policy.patternClassification).toBeNull();
    expect(policy.rerouteGuidance).toBeNull();
    expect(policy.unsupportedStateReason).toContain("semantically misleading");
  });

  it("rejects pattern-aware counting on binary-confident surfaces and emits reroute guidance", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      },
      pattern: "preview-first",
    });

    expect(policy.executionLane).toBe(CountQueryExecutionLane.UNSUPPORTED_STATE);
    expect(policy.patternClassification?.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.literal,
    );
    expect(policy.rerouteGuidance).toContain("byte- or cursor-oriented inspection");
    expect(policy.unsupportedStateReason).toContain("Pattern-aware line counting is unsupported");
  });

  it("uses the streaming pattern-aware lane for non-UTF-8 text surfaces", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
      },
      pattern: "preview-first",
    });

    expect(policy.executionLane).toBe(CountQueryExecutionLane.STREAMING_PATTERN_AWARE);
    expect(policy.patternClassification?.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.literal,
    );
    expect(policy.syncCandidateBytesCap).toBeNull();
    expect(policy.serviceHardGapBytes).toBeNull();
  });

  it("uses the native pattern-aware lane and fixed-string caps for UTF-8 literal queries", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      },
      pattern: "preview-first",
    });
    const searchExecutionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    expect(policy.executionLane).toBe(CountQueryExecutionLane.NATIVE_PATTERN_AWARE);
    expect(policy.patternClassification?.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.literal,
    );
    expect(policy.syncCandidateBytesCap).toBe(
      searchExecutionPolicy.fixedStringSyncCandidateBytesCap,
    );
    expect(policy.serviceHardGapBytes).toBe(
      searchExecutionPolicy.fixedStringServiceHardGapBytes,
    );
  });

  it("uses the native pattern-aware lane and regex caps for automaton-safe regex queries", () => {
    const policy = resolveCountQueryPolicy({
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      inspectionContentClassification: {
        resolvedState: INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
        resolvedTextEncoding: INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
      },
      pattern: "preview-.*-mode",
    });
    const searchExecutionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    expect(policy.executionLane).toBe(CountQueryExecutionLane.NATIVE_PATTERN_AWARE);
    expect(policy.patternClassification?.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.automatonSafeRegex,
    );
    expect(policy.syncCandidateBytesCap).toBe(
      searchExecutionPolicy.regexSyncCandidateBytesCap,
    );
    expect(policy.serviceHardGapBytes).toBe(
      searchExecutionPolicy.regexServiceHardGapBytes,
    );
  });

  it("builds a literal native-count command without line numbers and keeps the hybrid literal lane explicit", () => {
    const command = buildPatternAwareCountCommand({
      candidatePath: "src/domain/shared/search/search-execution-policy.ts",
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      pattern: "preview-first",
      caseSensitive: false,
      hybridLiteralSearchLane: true,
    });
    const searchExecutionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    expect(command.executable).toBe("C:/tools/ugrep.exe");
    expect(command.args).not.toContain("--line-number");
    expect(command.args).toContain("--count");
    expect(command.args).toContain("--no-messages");
    expect(command.args).toContain("--fixed-strings");
    expect(command.args).toContain("--binary-files=text");
    expect(command.args).toContain("--ignore-case");
    expect(command.args.slice(-2)).toEqual([
      "preview-first",
      "src/domain/shared/search/search-execution-policy.ts",
    ]);
    expect(command.fixedStringMode).toBe(true);
    expect(command.hybridLiteralSearchLane).toBe(true);
    expect(command.requiresPcre2).toBe(false);
    expect(command.syncCandidateBytesCap).toBe(
      searchExecutionPolicy.fixedStringSyncCandidateBytesCap,
    );
  });

  it("builds a PCRE2 count command with explicit context and max-count flags", () => {
    const command = buildPatternAwareCountCommand({
      candidatePath: "src/domain/shared/search/pattern-classifier.ts",
      ioCapabilityProfile: PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
      pattern: "(?<=preview-)mode",
      caseSensitive: true,
      beforeContextLines: 2,
      afterContextLines: 3,
      maxCount: 4,
    });

    expect(command.args).toContain("--perl-regexp");
    expect(command.args).toContain("--before-context=2");
    expect(command.args).toContain("--after-context=3");
    expect(command.args).toContain("--max-count=4");
    expect(command.args).not.toContain("--ignore-case");
    expect(command.args).not.toContain("--line-number");
    expect(command.fixedStringMode).toBe(false);
    expect(command.hybridLiteralSearchLane).toBe(false);
    expect(command.requiresPcre2).toBe(true);
  });
});
