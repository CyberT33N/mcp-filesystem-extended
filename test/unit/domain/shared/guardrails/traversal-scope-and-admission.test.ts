import { describe, expect, it } from "vitest";

import { createGitIgnoreTraversalEnrichment } from "@domain/shared/guardrails/gitignore-traversal-enrichment";
import {
  DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES,
  isExplicitTraversalRootInsideDefaultExcludedClass,
  isPathInsideDefaultTraversalScopeExclusion,
  normalizeTraversalScopePath,
  resolveTraversalScopePolicy,
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import {
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
  resolveTraversalWorkloadAdmissionDecision,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

describe("traversal scope and admission", () => {
  it("normalizes traversal paths and detects default-excluded roots deterministically", () => {
    expect(normalizeTraversalScopePath("./dist//nested/")).toBe("dist/nested");
    expect(DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES).toContain("node_modules");
    expect(isPathInsideDefaultTraversalScopeExclusion("src/node_modules/pkg")).toBe(true);
    expect(isExplicitTraversalRootInsideDefaultExcludedClass("dist")).toBe(true);
  });

  it("applies the shared exclusion baseline, includeExcluded globs, and optional gitignore enrichment for broad roots", () => {
    const gitIgnoreTraversalEnrichment = createGitIgnoreTraversalEnrichment("coverage/\n");
    const resolution = resolveTraversalScopePolicy(".", ["custom/**"], {
      includeExcludedGlobs: ["dist/keep.ts"],
      respectGitIgnore: true,
      gitIgnoreTraversalEnrichment,
    });

    expect(resolution.explicitExcludedRoot).toBe(false);
    expect(resolution.applyDefaultExcludedClasses).toBe(true);
    expect(resolution.gitIgnoreEnrichmentApplied).toBe(true);
    expect(shouldExcludeTraversalScopePath("node_modules/pkg/index.js", resolution)).toBe(true);
    expect(shouldTraverseTraversalScopeDirectoryPath("dist", resolution)).toBe(true);
    expect(shouldExcludeTraversalScopePath("dist/keep.ts", resolution)).toBe(false);
    expect(shouldExcludeTraversalScopePath("coverage/report.txt", resolution)).toBe(true);
  });

  it("preserves explicit access to roots inside excluded trees without reapplying the default exclusion baseline", () => {
    const resolution = resolveTraversalScopePolicy("node_modules/vitest", ["coverage/**"]);

    expect(resolution.explicitExcludedRoot).toBe(true);
    expect(resolution.applyDefaultExcludedClasses).toBe(false);
    expect(resolution.effectiveExcludeGlobs).toEqual(["coverage/**"]);
    expect(shouldExcludeTraversalScopePath("package.json", resolution)).toBe(false);
  });

  it("keeps bounded workloads inline when breadth, candidate size, and response text remain inside the inline admission band", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        validPath: "C:/workspace/src/domain/shared",
        type: "directory",
        size: 0,
      },
      admissionEvidence: {
        requestedRoot: "src/domain/shared",
        visitedEntries: 100,
        visitedDirectories: 10,
        elapsedMs: 25,
      },
      candidateWorkloadEvidence: {
        estimatedCandidateBytes: 1_024,
        matchedCandidateFiles: 2,
        estimatedResponseChars: 120,
        probeElapsedMs: 25,
        probeTruncated: false,
      },
      projectedInlineTextChars: 200,
      executionPolicy,
      consumerCapabilities: {
        toolName: "search_file_contents_by_regex",
        previewFirstSupported: true,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 50,
        inlineTextResponseCapChars: 1_000,
        executionTimeCostMultiplier: 1,
        estimatedPerCandidateFileCostMs: 10,
        taskBackedExecutionSupported: false,
      },
    });

    expect(decision).toEqual({
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
    });
  });

  it("switches to preview-first admission when the projected inline response text exceeds the consumer cap", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        validPath: "C:/workspace/src/domain/shared",
        type: "directory",
        size: 0,
      },
      admissionEvidence: {
        requestedRoot: "src/domain/shared",
        visitedEntries: 100,
        visitedDirectories: 10,
        elapsedMs: 25,
      },
      candidateWorkloadEvidence: {
        estimatedCandidateBytes: 1_024,
        matchedCandidateFiles: 2,
        estimatedResponseChars: 120,
        probeElapsedMs: 25,
        probeTruncated: false,
      },
      projectedInlineTextChars: 1_500,
      executionPolicy,
      consumerCapabilities: {
        toolName: "search_file_contents_by_regex",
        previewFirstSupported: true,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 50,
        inlineTextResponseCapChars: 1_000,
        executionTimeCostMultiplier: 1,
        estimatedPerCandidateFileCostMs: 10,
        taskBackedExecutionSupported: false,
      },
    });

    expect(decision.outcome).toBe(TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST);
    expect(decision.guidanceText).toContain("structured data can remain authoritative");
  });

  it("requires a completion-backed lane when inline execution is too large and preview-first is unavailable", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        validPath: "C:/workspace/src/domain/shared",
        type: "directory",
        size: 0,
      },
      admissionEvidence: {
        requestedRoot: "src/domain/shared",
        visitedEntries: 100,
        visitedDirectories: 10,
        elapsedMs: 25,
      },
      candidateWorkloadEvidence: {
        estimatedCandidateBytes: 1_024,
        matchedCandidateFiles: 2,
        estimatedResponseChars: 120,
        probeElapsedMs: 25,
        probeTruncated: false,
      },
      projectedInlineTextChars: 1_500,
      executionPolicy,
      consumerCapabilities: {
        toolName: "search_file_contents_by_regex",
        previewFirstSupported: false,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 50,
        inlineTextResponseCapChars: 1_000,
        executionTimeCostMultiplier: 1,
        estimatedPerCandidateFileCostMs: 10,
        taskBackedExecutionSupported: true,
      },
    });

    expect(decision.outcome).toBe(
      TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    );
    expect(decision.guidanceText).toContain("task-backed execution lane");
  });

  it("requires narrowing when the traversal exceeds inline admission and the consumer has no preview-first or task-backed lane", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        validPath: "C:/workspace/src/domain/shared",
        type: "directory",
        size: 0,
      },
      admissionEvidence: {
        requestedRoot: "src/domain/shared",
        visitedEntries: executionPolicy.traversalPreviewFirstEntryBudget + 1,
        visitedDirectories: 10,
        elapsedMs: 25,
      },
      candidateWorkloadEvidence: {
        estimatedCandidateBytes: 1_024,
        matchedCandidateFiles: 2,
        estimatedResponseChars: 120,
        probeElapsedMs: 25,
        probeTruncated: false,
      },
      projectedInlineTextChars: 200,
      executionPolicy,
      consumerCapabilities: {
        toolName: "search_file_contents_by_regex",
        previewFirstSupported: false,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 50,
        inlineTextResponseCapChars: 1_000,
        executionTimeCostMultiplier: 1,
        estimatedPerCandidateFileCostMs: 10,
        taskBackedExecutionSupported: false,
      },
    });

    expect(decision.outcome).toBe(TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.NARROWING_REQUIRED);
    expect(decision.guidanceText).toContain("Narrow the requested root 'src/domain/shared'");
    expect(decision.guidanceText).toContain("no task-backed execution lane");
  });
});
