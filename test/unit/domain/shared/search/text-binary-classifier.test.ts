import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  INSPECTION_CONTENT_STATE_LITERALS,
  INSPECTION_CONTENT_TEXT_ENCODING_LITERALS,
} from "@domain/shared/search/inspection-content-state";
import { classifyTextBinarySurface } from "@domain/shared/search/text-binary-classifier";

describe("classifyTextBinarySurface", () => {
  it("keeps known text extensions eligible even before bounded probe evidence exists", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "src/domain/shared/search/search-execution-policy.ts",
    });

    expect(result.isTextEligible).toBe(true);
    expect(result.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
    expect(result.usedAssistList).toBe(true);
    expect(result.usedContentProbe).toBe(false);
    expect(result.classificationReason).toContain("text-dominant enough");
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

  it("accepts UTF-16 LE SQL-like text samples even when raw NUL bytes are present", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "fixtures/sample.sql",
      contentSample: Buffer.from("USE [Z1]\nGO\n", "utf16le"),
    });

    expect(result.isTextEligible).toBe(true);
    expect(result.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
    );
    expect(result.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
    );
    expect(result.usedAssistList).toBe(true);
    expect(result.usedContentProbe).toBe(true);
    expect(result.classificationReason).toContain("text-compatible");
  });

  it("keeps unknown text-compatible extensions eligible through the hybrid text-dominant state", () => {
    const result = classifyTextBinarySurface({
      candidatePath: "fixtures/unknown.custom",
      contentSample: new TextEncoder().encode("preview-first behavior stays textual\n"),
    });

    expect(result.isTextEligible).toBe(true);
    expect(result.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
    expect(result.usedAssistList).toBe(false);
    expect(result.usedContentProbe).toBe(true);
    expect(result.classificationReason).toContain("text-dominant enough");
  });
});
