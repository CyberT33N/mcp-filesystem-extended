# Filesystem MCP Server

TypeScript implementation of a local filesystem MCP server with bounded inspection, comparison, and mutation surfaces.

This root README is the DX-first entrypoint. It keeps only shared orientation and routes detailed tool guidance to endpoint-local `README.md` files.

## Read this next

| Need | Start here |
|---|---|
| Shared conventions and cross-endpoint rules | [`CONVENTIONS.md`](CONVENTIONS.md) |
| Shared architecture and ownership boundaries | [`DESCRIPTION.md`](DESCRIPTION.md) |
| Tool-specific quick guidance | Endpoint-local `README.md` links below |

## Architecture at a glance

| Layer | Responsibility |
|---|---|
| `application` | MCP bootstrap, tool-catalog composition, stable server framing, and server-scope exposure |
| `domain` | Tool-specific handlers, schemas, results, and runtime semantics |
| `infrastructure` | Path guarding, logging, persistence, and shared technical helpers |

## Shared developer rules

- All path-based operations stay inside configured allowed directories.
- Broad-root discovery and recursive inspection default-exclude vendor, cache, and generated trees unless callers explicitly target them or reopen named descendants.
- Resume-capable inspection families stay same-endpoint and continue through `resumeToken` plus the appropriate `resumeMode`.
- Primary result data stays complete in `content.text`; `structuredContent` adds machine-readable envelope metadata and mirrored structured payloads.
- Public read surfaces remain intentionally split: [`read_files_with_line_numbers`](src/domain/inspection/read-files-with-line-numbers/README.md) for bounded inline batch reads, [`read_file_content`](src/domain/inspection/read-file-content/README.md) for advanced single-file modes.

## External dependency for content search

The regex and fixed-string search lanes depend on `ugrep`.

Common installation examples:

- Debian/Ubuntu: `apt-get install ugrep`
- Fedora/RHEL/CentOS: `dnf install ugrep`
- Arch: `pacman -S ugrep`
- macOS: `brew install ugrep`
- Windows: `winget install Genivia.ugrep` or `choco install ugrep`

After installation, verify with `ugrep --version`.

## Endpoint README TOC

### Application/server scope

- [`list_allowed_directories`](src/application/server/list-allowed-directories/README.md)

### Inspection — discovery

- [`list_directory_entries`](src/domain/inspection/list-directory-entries/README.md)
- [`find_paths_by_name`](src/domain/inspection/find-paths-by-name/README.md)
- [`find_files_by_glob`](src/domain/inspection/find-files-by-glob/README.md)

### Inspection — metadata and integrity

- [`get_path_metadata`](src/domain/inspection/get-path-metadata/README.md)
- [`get_file_checksums`](src/domain/inspection/get-file-checksums/README.md)
- [`verify_file_checksums`](src/domain/inspection/verify-file-checksums/README.md)

### Inspection — search and count

- [`search_file_contents_by_regex`](src/domain/inspection/search-file-contents-by-regex/README.md)
- [`search_file_contents_by_fixed_string`](src/domain/inspection/search-file-contents-by-fixed-string/README.md)
- [`count_lines`](src/domain/inspection/count-lines/README.md)

### Inspection — read

- [`read_files_with_line_numbers`](src/domain/inspection/read-files-with-line-numbers/README.md)
- [`read_file_content`](src/domain/inspection/read-file-content/README.md)

### Comparison

- [`diff_files`](src/domain/comparison/diff-files/README.md)
- [`diff_text_content`](src/domain/comparison/diff-text-content/README.md)

### Mutation — content

- [`create_files`](src/domain/mutation/create-files/README.md)
- [`append_files`](src/domain/mutation/append-files/README.md)
- [`replace_file_line_ranges`](src/domain/mutation/replace-file-line-ranges/README.md)

### Mutation — path

- [`create_directories`](src/domain/mutation/create-directories/README.md)
- [`copy_paths`](src/domain/mutation/copy-paths/README.md)
- [`move_paths`](src/domain/mutation/move-paths/README.md)
- [`delete_paths`](src/domain/mutation/delete-paths/README.md)

## Documentation boundary

Root documentation stays shared and non-redundant:

- [`README.md`](README.md) = DX-first entrypoint
- [`DESCRIPTION.md`](DESCRIPTION.md) = architecture index
- [`CONVENTIONS.md`](CONVENTIONS.md) = shared conventions and leaf-slice routing
- endpoint-local `README.md` files = detailed developer-facing guidance per public endpoint

This root file is intentionally a navigation surface, not a second endpoint-by-endpoint manual.
