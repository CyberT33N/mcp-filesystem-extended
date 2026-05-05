import { describe, expect, it } from "vitest";

import {
  ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
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
});
