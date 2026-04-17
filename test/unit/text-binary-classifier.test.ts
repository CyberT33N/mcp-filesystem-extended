import { describe, expect, it } from "vitest";

import { classifyTextBinarySurface } from "@domain/shared/search/text-binary-classifier";

describe("classifyTextBinarySurface", () => {
  it("accepts known text extensions without requiring a probe", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "src/domain/shared/search/search-execution-policy.ts",
    });

    expect(result.isTextEligible).toBe(true);
    expect(result.usedAssistList).toBe(true);
    expect(result.usedContentProbe).toBe(false);
    expect(result.classificationReason).toContain("assist list");
  });

  it("rejects explicit binary container classes before any content probe runs", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "fixtures/archive.zip",
    });

    expect(result.isTextEligible).toBe(false);
    expect(result.usedAssistList).toBe(false);
    expect(result.usedContentProbe).toBe(false);
    expect(result.classificationReason).toContain("binary or container class");
  });

  it("requires a probe for unknown extensions and rejects NUL-byte samples as binary", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "fixtures/unknown.custom",
      contentSample: new Uint8Array([0x41, 0x00, 0x42]),
    });

    expect(result.isTextEligible).toBe(false);
    expect(result.usedAssistList).toBe(false);
    expect(result.usedContentProbe).toBe(true);
    expect(result.classificationReason).toContain("NUL-byte");
  });

  it("accepts unknown extensions when the content probe stays within conservative text thresholds", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "fixtures/unknown.custom",
      contentSample: new TextEncoder().encode("preview-first behavior stays textual\n"),
    });

    expect(result.isTextEligible).toBe(true);
    expect(result.usedAssistList).toBe(false);
    expect(result.usedContentProbe).toBe(true);
    expect(result.classificationReason).toContain("conservative text thresholds");
  });
});
