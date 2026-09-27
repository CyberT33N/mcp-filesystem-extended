import { describe, expect, it } from "vitest";

import {
  COUNT_LINES_RESPONSE_CAP_CHARS,
  DISCOVERY_RESPONSE_CAP_CHARS,
  FILE_DIFF_RESPONSE_CAP_CHARS,
  FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS,
  METADATA_RESPONSE_CAP_CHARS,
  READ_FILE_CONTENT_RESPONSE_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
  TEXT_DIFF_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

const formatCharacters = (value: number): string =>
  `${new Intl.NumberFormat("en-US").format(value)} characters`;

import {
  ADDITIVE_LOCAL_TOOL_ANNOTATIONS,
  buildAppendFilesToolDescription,
  buildCopyPathsToolDescription,
  buildCountLinesToolDescription,
  buildCreateDirectoriesToolDescription,
  buildCreateFilesToolDescription,
  buildCreateSymbolicLinksToolDescription,
  buildDeletePathsToolDescription,
  buildDiffFilesToolDescription,
  buildDiffTextContentToolDescription,
  buildFindFilesByGlobToolDescription,
  buildFindPathsByNameToolDescription,
  buildGetFileChecksumsToolDescription,
  buildGetPathMetadataToolDescription,
  buildListAllowedDirectoriesToolDescription,
  buildListDirectoryEntriesToolDescription,
  buildMovePathsToolDescription,
  buildReadFileContentToolDescription,
  buildReadFilesWithLineNumbersToolDescription,
  buildReplaceFileLineRangesToolDescription,
  buildSearchFileContentsByFixedStringToolDescription,
  buildSearchFileContentsByRegexToolDescription,
  buildVerifyFileByteIdentityToolDescription,
  buildVerifyFileChecksumsToolDescription,
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
    expect(description).toContain("mismatches are refused rather than materialized");
  });

  it("builds the verify_symbolic_links description from the shared metadata-family cap", () => {
    const description = buildVerifySymbolicLinksToolDescription();

    expect(description).toContain("symbolic links");
    expect(description).toContain("dangling-link detection");
    expect(description).toContain("100,000 characters");
    expect(description).toContain("does not use preview-style resume behavior");
  });

  it("builds every discovery, search, and count description with its family cap and resume contract", () => {
    const continuationAuthority = "STRUCTURED_CONTINUATION_AUTHORITY";
    const textSurfacing = "TEXT_SURFACING";
    const finalPreview = "FINAL_PREVIEW";
    const externalBoundary = "EXTERNAL_BOUNDARY";

    const listDescription = buildListDirectoryEntriesToolDescription(
      continuationAuthority,
      textSurfacing,
      finalPreview,
      externalBoundary,
    );
    expect(listDescription).toContain("Lists structured directory entries");
    expect(listDescription).toContain(formatCharacters(DISCOVERY_RESPONSE_CAP_CHARS));
    expect(listDescription).toContain(continuationAuthority);
    expect(listDescription).toContain(textSurfacing);
    expect(listDescription).toContain(finalPreview);
    expect(listDescription).toContain(externalBoundary);

    const findByName = buildFindPathsByNameToolDescription(continuationAuthority);
    expect(findByName).toContain("case-insensitive name substring");
    expect(findByName).toContain(formatCharacters(DISCOVERY_RESPONSE_CAP_CHARS));
    expect(findByName).toContain(continuationAuthority);

    const findByGlob = buildFindFilesByGlobToolDescription(continuationAuthority);
    expect(findByGlob).toContain("glob pattern");
    expect(findByGlob).toContain(continuationAuthority);

    const regexSearch = buildSearchFileContentsByRegexToolDescription(continuationAuthority);
    expect(regexSearch).toContain("regular expression");
    expect(regexSearch).toContain(formatCharacters(REGEX_SEARCH_RESPONSE_CAP_CHARS));
    expect(regexSearch).toContain(continuationAuthority);

    const fixedSearch = buildSearchFileContentsByFixedStringToolDescription(continuationAuthority);
    expect(fixedSearch).toContain("exact fixed string");
    expect(fixedSearch).toContain(formatCharacters(FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS));

    const countLines = buildCountLinesToolDescription(continuationAuthority);
    expect(countLines).toContain("Counts lines");
    expect(countLines).toContain(formatCharacters(COUNT_LINES_RESPONSE_CAP_CHARS));
    expect(countLines).toContain("complete-result");
    expect(countLines).toContain(continuationAuthority);
  });

  it("builds every diff and metadata description with its family cap", () => {
    const diffFiles = buildDiffFilesToolDescription();
    expect(diffFiles).toContain("unified diffs");
    expect(diffFiles).toContain(formatCharacters(FILE_DIFF_RESPONSE_CAP_CHARS));

    const diffText = buildDiffTextContentToolDescription();
    expect(diffText).toContain("in-memory text content pairs");
    expect(diffText).toContain(formatCharacters(TEXT_DIFF_RESPONSE_CAP_CHARS));

    const pathMetadata = buildGetPathMetadataToolDescription();
    expect(pathMetadata).toContain("structured metadata");
    expect(pathMetadata).toContain(formatCharacters(METADATA_RESPONSE_CAP_CHARS));

    const checksums = buildGetFileChecksumsToolDescription();
    expect(checksums).toContain("selected hash algorithm");
    expect(checksums).toContain(formatCharacters(METADATA_RESPONSE_CAP_CHARS));

    const verifyChecksums = buildVerifyFileChecksumsToolDescription();
    expect(verifyChecksums).toContain("expected hash values");
    expect(verifyChecksums).toContain(formatCharacters(METADATA_RESPONSE_CAP_CHARS));
  });

  it("builds every mutation and server-scope description with its boundary cues", () => {
    expect(buildCreateFilesToolDescription()).toContain("do not already exist");
    expect(buildAppendFilesToolDescription()).toContain("additive writes at file end");
    expect(buildReplaceFileLineRangesToolDescription()).toContain(
      formatCharacters(FILE_DIFF_RESPONSE_CAP_CHARS),
    );
    expect(buildCreateDirectoriesToolDescription()).toContain("missing parent directories");
    expect(buildCopyPathsToolDescription()).toContain("remain in place after the operation");
    expect(buildMovePathsToolDescription()).toContain("no longer remain at the original path");
    expect(buildDeletePathsToolDescription()).toContain("explicit recursive intent");
    expect(buildListAllowedDirectoriesToolDescription()).toContain(
      "directory roots this MCP server may access",
    );
  });

  it("builds the read-family descriptions with the direct-read caps and bounded window constants", () => {
    const readFiles = buildReadFilesWithLineNumbersToolDescription();
    expect(readFiles).toContain("line-numbered content blocks");
    expect(readFiles).toContain(formatCharacters(READ_FILES_RESPONSE_CAP_CHARS));

    const readFileContent = buildReadFileContentToolDescription();
    expect(readFileContent).toContain("chunk-cursor");
    expect(readFileContent).toContain(formatCharacters(READ_FILE_CONTENT_RESPONSE_CAP_CHARS));
    expect(readFileContent).toContain("500 lines");
    expect(readFileContent).toContain("2,000 lines");
    expect(readFileContent).toContain("256 KiB");
    expect(readFileContent).toContain("1 MiB");
  });
});
