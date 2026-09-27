import { describe, expect, it } from "vitest";

import {
  createGitIgnoreTraversalEnrichment,
  createGitIgnoreTraversalHierarchy,
} from "@domain/shared/guardrails/gitignore-traversal-enrichment";
import {
  DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES,
  isExplicitTraversalRootInsideDefaultExcludedClass,
  isPathInsideDefaultTraversalScopeExclusion,
  normalizeTraversalScopePath,
  resolveTraversalScopeEntryPolicy,
  resolveTraversalScopePolicy,
  shouldExcludeTraversalScopePath,
  shouldTraverseTraversalScopeDirectoryPath,
} from "@domain/shared/guardrails/traversal-scope-policy";
import {
  TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES,
  buildTraversalPreviewFirstTruncationGuidance,
  resolveResumePassAdmissionDecision,
  resolveTraversalWorkloadAdmissionDecision,
} from "@domain/shared/guardrails/traversal-workload-admission";
import { PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE } from "@domain/shared/runtime/io-capability-profile";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";

describe("traversal scope and admission", () => {
  it("normalizes traversal paths and detects default-excluded roots deterministically", () => {
    expect(normalizeTraversalScopePath("./dist//nested/")).toBe("dist/nested");
    expect(DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES).toContain("node_modules");
    expect(DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES).toContain(".turbo");
    expect(DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES).toContain(".next");
    expect(isPathInsideDefaultTraversalScopeExclusion("src/node_modules/pkg")).toBe(true);
    expect(isExplicitTraversalRootInsideDefaultExcludedClass("dist")).toBe(true);
  });

  it("applies the shared exclusion baseline, includeExcluded globs, and optional gitignore enrichment for broad roots", async () => {
    const gitIgnoreTraversalHierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");
    gitIgnoreTraversalHierarchy.layerCache.set(
      ".",
      createGitIgnoreTraversalEnrichment("coverage/\n"),
    );
    const resolution = resolveTraversalScopePolicy(".", ["custom/**"], {
      includeExcludedGlobs: ["dist/keep.ts"],
      respectGitIgnore: true,
      gitIgnoreTraversalHierarchy,
    });

    expect(resolution.explicitExcludedRoot).toBe(false);
    expect(resolution.applyDefaultExcludedClasses).toBe(true);
    expect(resolution.gitIgnoreEnrichmentApplied).toBe(true);
    expect(shouldExcludeTraversalScopePath("node_modules/pkg/index.js", resolution)).toBe(true);
    expect(shouldTraverseTraversalScopeDirectoryPath("dist", resolution)).toBe(true);
    expect(shouldExcludeTraversalScopePath("dist/keep.ts", resolution)).toBe(false);
    await expect(
      resolveTraversalScopeEntryPolicy("coverage/report.txt", false, resolution),
    ).resolves.toEqual({
      excluded: true,
      shouldTraverse: false,
    });
  });

  it("applies nested gitignore layers only to their owning subtree", async () => {
    const gitIgnoreTraversalHierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");
    gitIgnoreTraversalHierarchy.layerCache.set(
      ".",
      createGitIgnoreTraversalEnrichment("coverage/\n"),
    );
    gitIgnoreTraversalHierarchy.layerCache.set(
      "packages/app",
      createGitIgnoreTraversalEnrichment("secret/\n", {
        sourcePath: "packages/app/.gitignore",
      }),
    );
    const resolution = resolveTraversalScopePolicy(".", [], {
      respectGitIgnore: true,
      gitIgnoreTraversalHierarchy,
    });

    await expect(
      resolveTraversalScopeEntryPolicy("packages/app/secret/token.txt", false, resolution),
    ).resolves.toEqual({
      excluded: true,
      shouldTraverse: false,
    });
    await expect(
      resolveTraversalScopeEntryPolicy("packages/other/secret/token.txt", false, resolution),
    ).resolves.toEqual({
      excluded: false,
      shouldTraverse: true,
    });
    await expect(
      resolveTraversalScopeEntryPolicy("packages/app", true, resolution),
    ).resolves.toEqual({
      excluded: false,
      shouldTraverse: true,
    });
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

  it("honors a consumer-owned inline execution budget override before degrading to preview-first", () => {
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
        matchedCandidateFiles: 78,
        estimatedResponseChars: 120,
        probeElapsedMs: 1_000,
        probeTruncated: false,
      },
      projectedInlineTextChars: 200,
      executionPolicy,
      consumerCapabilities: {
        toolName: "search_file_contents_by_regex",
        previewFirstSupported: true,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 500,
        inlineTextResponseCapChars: 1_000,
        executionTimeCostMultiplier: 2,
        estimatedPerCandidateFileCostMs: 90,
        inlineExecutionBudgetMs: 12_000,
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
    expect(decision.guidanceText).toContain("completion-backed execution lane");
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

  it("normalizes empty and root-like traversal paths to the canonical root marker", () => {
    expect(normalizeTraversalScopePath("")).toBe(".");
    expect(isPathInsideDefaultTraversalScopeExclusion("")).toBe(false);

    const resolution = resolveTraversalScopePolicy(".");
    expect(shouldExcludeTraversalScopePath(".", resolution)).toBe(false);
  });

  it("normalizes caller exclude globs across empty, slash-bearing, and bare-name forms", () => {
    const resolution = resolveTraversalScopePolicy(".", ["", "docs/internal", "logs"]);

    expect(shouldExcludeTraversalScopePath("docs/internal/spec.md", resolution)).toBe(true);
    expect(shouldExcludeTraversalScopePath("logs/app.txt", resolution)).toBe(true);
    expect(shouldExcludeTraversalScopePath("src/app.ts", resolution)).toBe(false);
  });

  it("applies includeExcluded glob normalization for empty and wildcard forms", () => {
    const resolution = resolveTraversalScopePolicy(".", ["dist/**"], {
      includeExcludedGlobs: ["", "dist/keep-*.ts"],
    });

    expect(shouldExcludeTraversalScopePath("dist/drop.ts", resolution)).toBe(true);
    expect(shouldExcludeTraversalScopePath("dist/keep-a.ts", resolution)).toBe(false);
  });

  it("keeps the gitignore hierarchy inert unless respectGitIgnore is enabled", () => {
    const withHierarchy = resolveTraversalScopePolicy(".", [], {
      respectGitIgnore: true,
    });
    expect(withHierarchy.gitIgnoreTraversalHierarchy).toBeNull();
    expect(withHierarchy.gitIgnoreEnrichmentApplied).toBe(false);

    const hierarchy = createGitIgnoreTraversalHierarchy("C:/workspace/root");
    const withoutRespect = resolveTraversalScopePolicy(".", [], {
      gitIgnoreTraversalHierarchy: hierarchy,
    });
    expect(withoutRespect.gitIgnoreTraversalHierarchy).toBeNull();
    expect(withoutRespect.gitIgnoreEnrichmentApplied).toBe(false);
  });

  it("keeps non-directory roots inline when no response budget is exceeded", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: null,
      consumerCapabilities: {
        previewFirstSupported: true,
        taskBackedExecutionSupported: false,
        toolName: "read_file_content",
      },
      executionPolicy,
      requestedRoot: "src/readme.md",
      rootEntry: {
        requestedPath: "src/readme.md",
        size: 10,
        type: "file",
        validPath: "C:/workspace/src/readme.md",
      },
    });

    expect(decision).toEqual({
      guidanceText: null,
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
    });
  });

  it("admits non-directory roots into preview-first when the projected inline response exceeds the cap", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: null,
      consumerCapabilities: {
        inlineTextResponseCapChars: 1_000,
        previewFirstSupported: true,
        taskBackedExecutionSupported: false,
        toolName: "read_file_content",
      },
      executionPolicy,
      projectedInlineTextChars: 2_000,
      requestedRoot: "src/readme.md",
      rootEntry: {
        requestedPath: "src/readme.md",
        size: 10,
        type: "file",
        validPath: "C:/workspace/src/readme.md",
      },
    });

    expect(decision.outcome).toBe(TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST);
    expect(decision.guidanceText).toContain("exceeds the bounded inline response surface");
  });

  it("requires a completion-backed lane for non-directory roots when preview-first is unavailable", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: null,
      consumerCapabilities: {
        inlineTextResponseCapChars: 1_000,
        previewFirstSupported: false,
        taskBackedExecutionSupported: true,
        toolName: "read_file_content",
      },
      executionPolicy,
      projectedInlineTextChars: 2_000,
      requestedRoot: "src/readme.md",
      rootEntry: {
        requestedPath: "src/readme.md",
        size: 10,
        type: "file",
        validPath: "C:/workspace/src/readme.md",
      },
    });

    expect(decision.outcome).toBe(
      TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    );
    expect(decision.guidanceText).toContain("completion-backed execution lane");
  });

  it("defaults the per-candidate-file cost when the consumer omits it", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: {
        elapsedMs: 25,
        requestedRoot: "src/domain/shared",
        visitedDirectories: 10,
        visitedEntries: 100,
      },
      candidateWorkloadEvidence: {
        estimatedCandidateBytes: 1_024,
        estimatedResponseChars: 120,
        matchedCandidateFiles: 2,
        probeElapsedMs: 25,
        probeTruncated: false,
      },
      consumerCapabilities: {
        executionTimeCostMultiplier: 1,
        inlineCandidateByteBudget: 10_000,
        inlineCandidateFileBudget: 50,
        inlineTextResponseCapChars: 1_000,
        previewFirstSupported: true,
        taskBackedExecutionSupported: false,
        toolName: "search_file_contents_by_regex",
      },
      executionPolicy,
      projectedInlineTextChars: 200,
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        size: 0,
        type: "directory",
        validPath: "C:/workspace/src/domain/shared",
      },
    });

    expect(decision).toEqual({
      guidanceText: null,
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
    });
  });

  it("keeps directory roots inline when no candidate workload evidence exists", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: {
        elapsedMs: 25,
        requestedRoot: "src/domain/shared",
        visitedDirectories: 10,
        visitedEntries: 100,
      },
      consumerCapabilities: {
        previewFirstSupported: true,
        taskBackedExecutionSupported: false,
        toolName: "list_directory_entries",
      },
      executionPolicy,
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        size: 0,
        type: "directory",
        validPath: "C:/workspace/src/domain/shared",
      },
    });

    expect(decision).toEqual({
      guidanceText: null,
      outcome: TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.INLINE,
    });
  });

  it("admits directory roots into preview-first when breadth exceeds the inline band but stays within the preview band", () => {
    const executionPolicy = resolveSearchExecutionPolicy(
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
    );

    const decision = resolveTraversalWorkloadAdmissionDecision({
      admissionEvidence: {
        elapsedMs: 25,
        requestedRoot: "src/domain/shared",
        visitedDirectories: 10,
        visitedEntries: executionPolicy.traversalInlineEntryBudget + 1,
      },
      consumerCapabilities: {
        previewFirstSupported: true,
        taskBackedExecutionSupported: false,
        toolName: "list_directory_entries",
      },
      executionPolicy,
      requestedRoot: "src/domain/shared",
      rootEntry: {
        requestedPath: "src/domain/shared",
        size: 0,
        type: "directory",
        validPath: "C:/workspace/src/domain/shared",
      },
    });

    expect(decision.outcome).toBe(TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST);
    expect(decision.guidanceText).toContain("admitted in preview-first mode");
  });

  it("reconstructs the preview-first admission decision for resume passes", () => {
    const decision = resolveResumePassAdmissionDecision("src/domain", "count_lines");

    expect(decision.outcome).toBe(TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES.PREVIEW_FIRST);
    expect(decision.guidanceText).toContain("admitted in preview-first mode");
  });

  it("builds canonical truncation guidance for exhausted preview lanes", () => {
    const guidance = buildTraversalPreviewFirstTruncationGuidance("src/domain", "count_lines");

    expect(guidance).toContain("stopped after the bounded preview lane");
    expect(guidance).toContain("Narrow the requested root 'src/domain'");
  });
});
