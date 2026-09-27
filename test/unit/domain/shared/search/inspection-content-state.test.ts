import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import {
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  INSPECTION_CONTENT_CONFIDENCE_LITERALS,
  INSPECTION_CONTENT_OPERATION_LITERALS,
  INSPECTION_CONTENT_STATE_LITERALS,
  INSPECTION_CONTENT_TEXT_ENCODING_LITERALS,
  classifyInspectionContentState,
  decodeInspectionContentTextBytes,
  resolveInspectionContentOperationCapability,
} from "@domain/shared/search/inspection-content-state";

describe("inspection content state", () => {
  it("classifies hard binary extension hints as binary-confident without probing content", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/archive.zip",
    });
    const capability = resolveInspectionContentOperationCapability(
      classification,
      INSPECTION_CONTENT_OPERATION_LITERALS.READ_TEXT,
    );

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    );
    expect(classification.confidence).toBe(
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
    );
    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
    );
    expect(classification.evidence.usedBinaryExtensionHint).toBe(true);
    expect(classification.evidence.usedContentProbe).toBe(false);
    expect(capability.isAllowed).toBe(false);
    expect(capability.requiresDecodedTextFallback).toBe(false);
  });

  it("keeps large unhinted surfaces unknown until bounded sample evidence exists", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/blob.custom",
      candidateFileBytes: Number.MAX_SAFE_INTEGER,
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE,
    );
    expect(classification.confidence).toBe(
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.LOW,
    );
    expect(classification.evidence.usedContentProbe).toBe(false);
    expect(classification.classificationReason).toContain(
      "No bounded sampled evidence",
    );
  });

  it("upgrades text-hinted UTF-8 samples to text-confident states when the probe stays strongly text-compatible", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/notes.txt",
      contentSample: new TextEncoder().encode(
        "preview-first behavior stays textual\n",
      ),
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
    );
    expect(classification.confidence).toBe(
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.HIGH,
    );
    expect(classification.evidence.usedTextExtensionHint).toBe(true);
    expect(classification.evidence.usedContentProbe).toBe(true);
    expect(classification.classificationReason).toContain(
      "text-confident surface",
    );
  });

  it("keeps large partially sampled text-compatible surfaces hybrid text dominant until all shared sample windows are covered", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/notes.txt",
      candidateFileBytes: Number.MAX_SAFE_INTEGER,
      contentSample: new TextEncoder().encode(
        "preview-first behavior stays textual\n",
      ),
    });
    const capability = resolveInspectionContentOperationCapability(
      classification,
      INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
    );

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
    expect(classification.confidence).toBe(
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
    );
    expect(classification.classificationReason).toContain(
      "lacks full shared sampling coverage",
    );
    expect(capability.isAllowed).toBe(true);
    expect(capability.requiresDecodedTextFallback).toBe(true);
  });

  it("classifies noisy sampled content as hybrid binary dominant when control-byte noise stays below the hard binary threshold", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/noisy.custom",
      contentSample: Uint8Array.from([65, 66, 67, 68, 69, 70, 7, 71]),
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_BINARY_DOMINANT,
    );
    expect(classification.confidence).toBe(
      INSPECTION_CONTENT_CONFIDENCE_LITERALS.MEDIUM,
    );
    expect(classification.evidence.usedContentProbe).toBe(true);
    expect(classification.classificationReason).toContain(
      "binary-dominant",
    );
  });

  it("decodes UTF-16 LE content and marks search-text operations as decoded-text fallbacks where required", () => {
    const contentSample = Buffer.from("USE [Z1]\nGO\n", "utf16le");
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/query.sql",
      contentSample,
      sampledWindowPositions: INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
    });
    const capability = resolveInspectionContentOperationCapability(
      classification,
      INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
    );

    expect(decodeInspectionContentTextBytes(contentSample, classification.resolvedTextEncoding)).toBe(
      "USE [Z1]\nGO\n",
    );
    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
    );
    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
    );
    expect(capability.isAllowed).toBe(true);
    expect(capability.requiresDecodedTextFallback).toBe(true);
  });

  it("classifies empty sampled content as strongly text-compatible", () => {
    const classification = classifyInspectionContentState({
      candidateFileBytes: 0,
      candidatePath: "fixtures/empty.txt",
      contentSample: new Uint8Array(0),
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.TEXT_CONFIDENT,
    );
    expect(decodeInspectionContentTextBytes(new Uint8Array(0), "utf8")).toBe("");
  });

  it("keeps tiny non-BOM samples on the UTF-8 encoding surface", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/two-bytes.custom",
      contentSample: Uint8Array.from([0x61, 0x00]),
    });

    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
    );
    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    );
  });

  it("classifies UTF-16 LE surfaces with strong control-byte noise as binary-confident", () => {
    const contentSample = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("\u0000\u0001\u0002\u0003", "utf16le"),
    ]);
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/control-heavy.dat",
      contentSample,
    });

    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
    );
    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    );
  });

  it("classifies UTF-16 LE surfaces with moderate control-byte noise as binary-dominant", () => {
    const contentSample = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(`abcdefgh\u0001\u0002`, "utf16le"),
    ]);
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/moderate-noise.dat",
      contentSample,
    });

    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF16LE,
    );
    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_BINARY_DOMINANT,
    );
  });

  it("keeps mixed UTF-8 samples text-dominant when evidence stays below the strong-text bar", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/mixed.txt",
      contentSample: new TextEncoder().encode(`${"a".repeat(49)}\u0001`),
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
  });

  it("marks surfaces without any bounded evidence or extension hint as unknown", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/payload.dat",
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.UNKNOWN_LARGE_SURFACE,
    );
    expect(classification.classificationReason).toContain(
      "No bounded sampled evidence is available for the candidate surface.",
    );
  });

  it("keeps strongly text-compatible samples without an extension hint hybrid text-dominant", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/no-extension",
      contentSample: new TextEncoder().encode("plain textual content\n"),
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
    expect(classification.classificationReason).toContain(
      "without a canonical text extension hint",
    );
  });

  it("skips replacement characters when counting text-compatible characters", () => {
    const sampleBytes = new TextEncoder().encode("a".repeat(99));
    const contentSample = new Uint8Array([...sampleBytes, 0xff]);
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/almost-clean.txt",
      contentSample,
    });

    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.HYBRID_TEXT_DOMINANT,
    );
    expect(classification.evidence.nulByteCount).toBe(0);
  });

  it("evaluates the UTF-16 heuristic for no-BOM samples with zero bytes in even positions", () => {
    const classification = classifyInspectionContentState({
      candidatePath: "fixtures/zero-even.custom",
      contentSample: Uint8Array.from([0x00, 0x00, 0x41, 0x00]),
    });

    expect(classification.resolvedTextEncoding).toBe(
      INSPECTION_CONTENT_TEXT_ENCODING_LITERALS.UTF8,
    );
    expect(classification.resolvedState).toBe(
      INSPECTION_CONTENT_STATE_LITERALS.BINARY_CONFIDENT,
    );
  });
});
