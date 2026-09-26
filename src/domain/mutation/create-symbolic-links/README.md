# `create_symbolic_links`

`create_symbolic_links` is the additive symbolic-link creation endpoint for caller-supplied link paths and targets.

## Use this endpoint when

- the link paths do not already exist,
- you want portable relative links (stored verbatim, resolved against the link's directory) or stable absolute links,
- you need the privilege-free Windows `junction` variant for directory links.

## Do not use this endpoint when

- you want to re-target or overwrite an existing link (remove it with `delete_paths` first),
- you need to verify existing links (use `verify_symbolic_links`),
- you need full file-content creation (use `create_files`).

## Public role

- Accepts `links[]` with `linkPath`, `target`, and optional `type`.
- Creates missing parent directories automatically.
- Refuses creation when the link path already exists, including an existing dangling link.
- Scope-checks the resolved target against the allowed directories before creation.
- On Windows, portable link creation requires Developer Mode or an elevated server process; failures answer with the deterministic `symlink_privilege_missing` family and its next valid action.
- Returns a concise mutation summary instead of echoing the full payload.

## Local documentation

- [`CONVENTIONS.md`](./CONVENTIONS.md) — endpoint-local conventions and guardrails.
- [`DESCRIPTION.md`](./DESCRIPTION.md) — endpoint-local architectural explanation for LLM agents.
