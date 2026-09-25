import { describe, expect, it } from "vitest";

import { formatSearchFixedStringContinuationAwareTextOutput } from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result";
import type { SearchFixedStringResult } from "@domain/inspection/search/search-file-contents-by-fixed-string/search-fixed-string-result";
import { SearchFileContentsByFixedStringResultSchema } from "@domain/inspection/search/search-file-contents-by-fixed-string/schema";
import { formatSearchRegexContinuationAwareTextOutput } from "@domain/inspection/search/search-file-contents-by-regex/search-regex-result";
import { SearchFileContentsByRegexResultSchema } from "@domain/inspection/search/search-file-contents-by-regex/schema";
import type { SearchAliasReferenceEvent } from "@domain/inspection/search/search-alias-attribution";
import {
  INSPECTION_RESUME_ADMISSION_OUTCOMES,
  INSPECTION_RESUME_MODES,
} from "@domain/shared/resume/inspection-resume-contract";

const INLINE_RESUME_SURFACE = {
  admission: {
    outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
    guidanceText: null,
    scopeReductionGuidanceText: null,
  },
  resume: {
    resumeToken: null,
    resumable: false,
    status: null,
    expiresAt: null,
    supportedResumeModes: [
      INSPECTION_RESUME_MODES.NEXT_CHUNK,
      INSPECTION_RESUME_MODES.COMPLETE_RESULT,
    ],
    recommendedResumeMode: null,
  },
} as const;

const EMPTY_SESSION_DELIVERY = {
  continuationPass: false,
  previouslyDeliveredCount: 0,
  previouslyDeliveredLocationCount: 0,
  sessionTotalCount: 1,
  sessionTotalLocationCount: 1,
} as const;

describe("search symlink exactly-once and alias-attribution regression contract", () => {
  it("pins the fixed-string text surface: one canonical match with alias attribution and alias events", () => {
    const output = formatSearchFixedStringContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/canonical.ts",
                line: 10,
                content: "const needle = true;",
                match: "needle",
                attributedAliases: ["aliases/link-a.ts", "aliases/link-b.ts"],
              },
            ],
            filesSearched: 1,
            totalMatches: 1,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
            aliasReferences: [
              {
                aliasPath: "aliases/late-link.ts",
                targetPath: "src/canonical.ts",
                disposition: "already-delivered",
              },
              {
                aliasPath: "aliases/escape.ts",
                targetPath: "C:/outside/secret.ts",
                disposition: "outside-scope",
              },
            ],
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: false,
        sessionDelivery: EMPTY_SESSION_DELIVERY,
        ...INLINE_RESUME_SURFACE,
      },
      "needle",
      100,
    );

    expect(output).toContain("File: src/canonical.ts");
    expect(output).toContain(
      "  Also referenced by aliases: aliases/link-a.ts, aliases/link-b.ts",
    );
    expect(output).toContain("Alias references:");
    expect(output).toContain(
      "  aliases/late-link.ts → src/canonical.ts (already delivered in this session — no new match)",
    );
    expect(output).toContain(
      "  aliases/escape.ts → C:/outside/secret.ts (not searched — link target outside the requested root)",
    );
  });

  it("pins the regex text surface: one canonical match with alias attribution and alias events", () => {
    const output = formatSearchRegexContinuationAwareTextOutput(
      {
        roots: [
          {
            root: "src",
            matches: [
              {
                file: "src/canonical.ts",
                line: 10,
                content: "const needle = true;",
                match: "needle",
                attributedAliases: ["aliases/link-a.ts"],
              },
            ],
            filesSearched: 1,
            totalMatches: 1,
            truncated: false,
            error: null,
            stopReason: null,
            stopMessage: null,
            aliasReferences: [
              {
                aliasPath: "aliases/late-link.ts",
                targetPath: "src/canonical.ts",
                disposition: "already-delivered",
              },
            ],
          },
        ],
        totalLocations: 1,
        totalMatches: 1,
        truncated: false,
        sessionDelivery: EMPTY_SESSION_DELIVERY,
        ...INLINE_RESUME_SURFACE,
      },
      "needle",
      100,
    );

    expect(output).toContain(
      "  Also referenced by aliases: aliases/link-a.ts",
    );
    expect(output).toContain(
      "  aliases/late-link.ts → src/canonical.ts (already delivered in this session — no new match)",
    );
  });

  it("pins the additive public contract: alias surfaces are optional on both endpoint result schemas", () => {
    const baseRoot = {
      root: "src",
      matches: [
        {
          file: "src/canonical.ts",
          line: 10,
          content: "const needle = true;",
          match: "needle",
        },
      ],
      filesSearched: 1,
      totalMatches: 1,
      truncated: false,
      error: null,
      stopReason: null,
      stopMessage: null,
    };
    const baseResult = {
      roots: [baseRoot],
      totalLocations: 1,
      totalMatches: 1,
      truncated: false,
      sessionDelivery: EMPTY_SESSION_DELIVERY,
      ...INLINE_RESUME_SURFACE,
    };

    expect(SearchFileContentsByFixedStringResultSchema.safeParse(baseResult).success).toBe(true);
    expect(SearchFileContentsByRegexResultSchema.safeParse(baseResult).success).toBe(true);

    const enrichedResult = {
      ...baseResult,
      roots: [
        {
          ...baseRoot,
          matches: [
            {
              ...baseRoot.matches[0],
              attributedAliases: ["aliases/link-a.ts"],
            },
          ],
          aliasReferences: [
            {
              aliasPath: "aliases/late-link.ts",
              targetPath: "src/canonical.ts",
              disposition: "already-delivered",
            },
          ],
        },
      ],
    };

    expect(SearchFileContentsByFixedStringResultSchema.safeParse(enrichedResult).success).toBe(true);
    expect(SearchFileContentsByRegexResultSchema.safeParse(enrichedResult).success).toBe(true);

    const invalidDispositionResult = {
      ...baseResult,
      roots: [
        {
          ...baseRoot,
          aliasReferences: [
            {
              aliasPath: "aliases/late-link.ts",
              targetPath: "src/canonical.ts",
              disposition: "re-searched",
            },
          ],
        },
      ],
    };

    expect(
      SearchFileContentsByFixedStringResultSchema.safeParse(invalidDispositionResult).success,
    ).toBe(false);
    expect(
      SearchFileContentsByRegexResultSchema.safeParse(invalidDispositionResult).success,
    ).toBe(false);
  });
});

describe("search alias-attribution formatter lane matrix", () => {
  const aliasReferenceEvents: SearchAliasReferenceEvent[] = [
    {
      aliasPath: "aliases/late-link.ts",
      targetPath: "src/canonical.ts",
      disposition: "already-delivered",
    },
  ];

  function createAliasCarrierResult(options: {
    admissionOutcome: "inline" | "preview-first" | "completion-backed-required";
    continuationPass: boolean;
    resumable: boolean;
    withMatches: boolean;
  }): SearchFixedStringResult {
    return {
      roots: [
        {
          root: "src",
          matches: options.withMatches
            ? [
                {
                  file: "src/canonical.ts",
                  line: 10,
                  content: "const needle = true;",
                  match: "needle",
                  attributedAliases: ["aliases/link-a.ts"],
                },
              ]
            : [],
          filesSearched: 1,
          totalMatches: options.withMatches ? 1 : 0,
          truncated: false,
          error: null,
          stopReason: null,
          stopMessage: null,
          aliasReferences: aliasReferenceEvents,
        },
      ],
      totalLocations: options.withMatches ? 1 : 0,
      totalMatches: options.withMatches ? 1 : 0,
      truncated: false,
      sessionDelivery: {
        continuationPass: options.continuationPass,
        previouslyDeliveredCount: 0,
        previouslyDeliveredLocationCount: 0,
        sessionTotalCount: options.withMatches ? 1 : 0,
        sessionTotalLocationCount: options.withMatches ? 1 : 0,
      },
      admission: {
        outcome: options.admissionOutcome,
        guidanceText: null,
        scopeReductionGuidanceText: null,
      },
      resume: {
        resumeToken: options.resumable ? "insresume_alias" : null,
        resumable: options.resumable,
        status: options.resumable ? "active" : null,
        expiresAt: options.resumable ? "2026-09-25T12:00:00.000Z" : null,
        supportedResumeModes: [
          INSPECTION_RESUME_MODES.NEXT_CHUNK,
          INSPECTION_RESUME_MODES.COMPLETE_RESULT,
        ],
        recommendedResumeMode: null,
      },
    };
  }

  const EXPECTED_ATTRIBUTION_LINE = "  Also referenced by aliases: aliases/link-a.ts";
  const EXPECTED_EVENT_LINE =
    "  aliases/late-link.ts → src/canonical.ts (already delivered in this session — no new match)";

  it("pins alias events on a zero-match inline pass for both endpoints", () => {
    const result = createAliasCarrierResult({
      admissionOutcome: "inline",
      continuationPass: false,
      resumable: false,
      withMatches: false,
    });

    const fixedStringOutput = formatSearchFixedStringContinuationAwareTextOutput(result, "needle", 100);
    const regexOutput = formatSearchRegexContinuationAwareTextOutput(result, "needle", 100);

    expect(fixedStringOutput).toContain("No matches found for fixed string: needle");
    expect(fixedStringOutput).toContain(EXPECTED_EVENT_LINE);
    expect(regexOutput).toContain("No matches found for regex: needle");
    expect(regexOutput).toContain(EXPECTED_EVENT_LINE);
  });

  it("pins the preview-slice alias surface with and without matches for both endpoints", () => {
    const withMatches = createAliasCarrierResult({
      admissionOutcome: "preview-first",
      continuationPass: false,
      resumable: true,
      withMatches: true,
    });
    const withoutMatches = createAliasCarrierResult({
      admissionOutcome: "preview-first",
      continuationPass: false,
      resumable: true,
      withMatches: false,
    });

    const fixedStringWithMatches = formatSearchFixedStringContinuationAwareTextOutput(withMatches, "needle", 100);
    const fixedStringWithoutMatches = formatSearchFixedStringContinuationAwareTextOutput(withoutMatches, "needle", 100);
    const regexWithMatches = formatSearchRegexContinuationAwareTextOutput(withMatches, "needle", 100);
    const regexWithoutMatches = formatSearchRegexContinuationAwareTextOutput(withoutMatches, "needle", 100);

    expect(fixedStringWithMatches).toContain(EXPECTED_ATTRIBUTION_LINE);
    expect(fixedStringWithMatches).toContain(EXPECTED_EVENT_LINE);
    expect(fixedStringWithoutMatches).toContain("No matches reached yet for fixed string: needle in this bounded preview slice");
    expect(fixedStringWithoutMatches).toContain(EXPECTED_EVENT_LINE);
    expect(regexWithMatches).toContain(EXPECTED_ATTRIBUTION_LINE);
    expect(regexWithMatches).toContain(EXPECTED_EVENT_LINE);
    expect(regexWithoutMatches).toContain("No matches reached yet for regex: needle in this bounded preview slice");
    expect(regexWithoutMatches).toContain(EXPECTED_EVENT_LINE);
  });

  it("pins the completion-delta alias surface with and without matches for both endpoints", () => {
    const withMatches = createAliasCarrierResult({
      admissionOutcome: "completion-backed-required",
      continuationPass: true,
      resumable: false,
      withMatches: true,
    });
    const withoutMatches = createAliasCarrierResult({
      admissionOutcome: "completion-backed-required",
      continuationPass: true,
      resumable: false,
      withMatches: false,
    });

    const fixedStringWithMatches = formatSearchFixedStringContinuationAwareTextOutput(withMatches, "needle", 100);
    const fixedStringWithoutMatches = formatSearchFixedStringContinuationAwareTextOutput(withoutMatches, "needle", 100);
    const regexWithMatches = formatSearchRegexContinuationAwareTextOutput(withMatches, "needle", 100);
    const regexWithoutMatches = formatSearchRegexContinuationAwareTextOutput(withoutMatches, "needle", 100);

    expect(fixedStringWithMatches).toContain(EXPECTED_ATTRIBUTION_LINE);
    expect(fixedStringWithMatches).toContain(EXPECTED_EVENT_LINE);
    expect(fixedStringWithoutMatches).toContain("No additional matches found for fixed string: needle in this completion pass");
    expect(fixedStringWithoutMatches).toContain(EXPECTED_EVENT_LINE);
    expect(regexWithMatches).toContain(EXPECTED_ATTRIBUTION_LINE);
    expect(regexWithMatches).toContain(EXPECTED_EVENT_LINE);
    expect(regexWithoutMatches).toContain("No additional matches found for regex: needle in this completion pass");
    expect(regexWithoutMatches).toContain(EXPECTED_EVENT_LINE);
  });
});
