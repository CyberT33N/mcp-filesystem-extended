import { describe, expect, it } from "vitest";

import {
  ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
  buildCreateSymbolicLinksToolDescription,
  buildVerifyFileByteIdentityToolDescription,
  buildVerifySymbolicLinksToolDescription,
  DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS,
  IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
} from "@application/server/tool-registration-presets";

describe("tool-registration-presets", () => {
  it("exports the read-only local annotation preset", () => {
    expect(READ_ONLY_LOCAL_TOOL_ANNOTATIONS).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("exports the additive and destructive local annotation presets", () => {
    expect(ADDITIVE_LOCAL_TOOL_ANNOTATIONS).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
  });

  it("exports the idempotent additive local annotation preset", () => {
    expect(IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("builds the verify_file_byte_identity description from the shared metadata-family cap", () => {
    const description = buildVerifyFileByteIdentityToolDescription();

    expect(description).toContain("byte-identical to a reference file");
    expect(description).toContain("governed-region proofs that end at a marker line");
    expect(description).toContain("100,000 characters");
    expect(description).toContain("does not use preview-style resume behavior");
  });

  it("builds the create_symbolic_links description with the portability and readiness cues", () => {
    const description = buildCreateSymbolicLinksToolDescription();

    expect(description).toContain("Creates one or more symbolic links");
    expect(description).toContain("stored verbatim");
    expect(description).toContain("Developer Mode");
    expect(description).toContain("junction");
    expect(description).toContain("refused rather than overwritten");
  });

  it("builds the verify_symbolic_links description from the shared metadata-family cap", () => {
    const description = buildVerifySymbolicLinksToolDescription();

    expect(description).toContain("symbolic links");
    expect(description).toContain("dangling-link detection");
    expect(description).toContain("100,000 characters");
    expect(description).toContain("does not use preview-style resume behavior");
  });
});
