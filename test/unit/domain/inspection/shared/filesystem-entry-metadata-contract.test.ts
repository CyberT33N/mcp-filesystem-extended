import { describe, expect, it } from "vitest";

import {
  BatchOperationErrorBaseSchema,
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  DefaultedFileSystemEntryMetadataSelectionSchema,
  FileSystemEntryMetadataSchema,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";

describe("filesystem_entry_metadata_contract", () => {
  it("defaults grouped metadata selection when callers omit optional flags", () => {
    const parsed = DefaultedFileSystemEntryMetadataSelectionSchema.parse(undefined);

    expect(parsed).toEqual(DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION);
  });

  it("parses canonical metadata with optional timestamp and permission groups", () => {
    const parsed = FileSystemEntryMetadataSchema.parse({
      accessed: "2026-01-05T20:22:00Z",
      created: "2026-01-05T20:22:00Z",
      modified: "2026-01-05T20:22:00Z",
      permissions: "644",
      size: 3,
      type: "file",
    });

    expect(parsed.type).toBe("file");
    expect(parsed.size).toBe(3);
    expect(parsed.permissions).toBe("644");
  });

  it("preserves batch error payloads with path and error details", () => {
    const parsed = BatchOperationErrorBaseSchema.parse({
      error: "Missing path.",
      path: "src/domain/example.ts",
    });

    expect(parsed).toEqual({
      error: "Missing path.",
      path: "src/domain/example.ts",
    });
  });
});
