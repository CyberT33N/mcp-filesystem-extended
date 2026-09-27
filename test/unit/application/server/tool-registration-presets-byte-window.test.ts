import { describe, expect, it, vi } from "vitest";

vi.mock("@domain/inspection/read-file-content/schema", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("@domain/inspection/read-file-content/schema")>();

  return {
    ...originalModule,
    READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES: 1_500,
    READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES: 2_500,
  };
});

import { buildReadFileContentToolDescription } from "@application/server/tool-registration-presets";

describe("tool-registration-presets byte-window formatting", () => {
  it("renders non-round byte windows as raw byte counts", () => {
    const description = buildReadFileContentToolDescription();

    expect(description).toContain("1,500 bytes");
    expect(description).toContain("2,500 bytes");
  });
});
