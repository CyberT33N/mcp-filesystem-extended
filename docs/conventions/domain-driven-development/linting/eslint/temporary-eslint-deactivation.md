# Convention: Temporary ESLint Deactivation

> **Context:** See [`CONVENTIONS.md`](../../../../../CONVENTIONS.md) for the root conventions index of this workspace.
> **Scope:** Development-process convention for the linting toolchain of this project. Server-architecture conventions remain owned by the root `conventions/` tree; this document owns only the temporary linting state.

---

## Purpose

This document is the single source of truth for the **temporary, fully deactivated ESLint state** of this workspace. It exists so that every maintainer and every LLM agent can see *that* the deactivation is deliberate, *why* it exists, and *how* it ends — without re-deriving the state from the commented-out config file.

---

## Binding Statements

1. **The ESLint plugin MUST be activated in the target state.** The `eslint-plugin-enterprise` master configuration is the intended linting backbone of this workspace. The deactivated state is not the target architecture; it is the documented interim state.
2. **In the current state, the enterprise plugin does not work.** The linked `eslint-plugin-enterprise` package exposes no built `exports` entry, so resolving it at config-load time fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. No work can be done with TypeScript ESLint — or ESLint in general — while the plugin is in that state.
3. **ESLint is therefore completely deactivated for now.** No lint run is expected to enforce rules in this state. A lint invocation that "runs green" in this state proves nothing beyond the absence of an active rule set.
4. **The ESLint configuration is commented out so the deactivation stays traceable.** The former configuration file keeps its full content as comments, and its file name carries the deliberate deactivation marker: `eslint.config.ts_` (trailing underscore). ESLint does not recognize that file name as a configuration file, which keeps the deactivated state mechanically enforced.

---

## Mechanism

| Surface | State in this interim | Reason |
|---|---|---|
| `eslint.config.ts_` (workspace root) | Former `eslint.config.ts`, fully commented out, renamed with the trailing-underscore deactivation marker | Keeps the deactivation visible, reversible, and out of the ESLint config resolution path |
| `eslint-plugin-enterprise` dependency | Removed from `package.json` | The linked package is not finished; keeping the reference would break `pnpm install` peer resolution |
| `@typescript-eslint/parser` dependency | Removed from `package.json` | The linked fork is outdated relative to the catalog line and is not usable while the plugin is unfinished |
| `typescript-eslint` / `@typescript-eslint/utils` dependencies | Removed from `package.json` and the catalog | Only consumed by the deactivated configuration |
| Remaining `eslint` / `eslint-plugin-*` catalog entries | Untouched | Working baseline stack that the re-enabled configuration will consume again |
| `.pnpmfile.cjs` link-rewrite infrastructure | Untouched | Stays inert while the link tokens are absent and resumes its role unchanged on re-enable |

---

## Re-Enable Conditions

The deactivated state ends when **all** of the following hold:

1. The linked `eslint-plugin-enterprise` package builds cleanly and exposes a valid `exports` entry.
2. The linked `@typescript-eslint/parser` fork line matches the catalog's `typescript-eslint` line again.
3. The dependencies listed above are restored to `package.json` (and the catalog where applicable).
4. `eslint.config.ts_` is renamed back to `eslint.config.ts` with its content un-commented.
5. A full lint run over the workspace executes with the enterprise rule set active.

When CI/CD is integrated later, the linting pipeline binds the re-enabled configuration; until the plugin is repaired, the pipeline simply does not execute the plugin.

---

## Verification

- `pnpm exec eslint <path>` does not load any workspace rule set (no `eslint.config.*` is resolved).
- `pnpm install` completes without the plugin-related peer-resolution failure.
- The file name `eslint.config.ts_` is visible in the workspace root as the deactivation marker.

---

## Non-Goals

- This convention does not redefine the enterprise rule set, the plugin's intended content, or any naming/type governance.
- This convention does not authorize shipping code that would fail the re-enabled rule set; the deactivated state removes mechanical enforcement, never the architectural expectation.
