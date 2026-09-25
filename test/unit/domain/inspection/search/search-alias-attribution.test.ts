import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectSearchAliasFileGroupAttributions,
  createSearchAliasAttributionState,
  formatSearchAliasReferenceEvents,
  normalizeSearchAliasIdentityKey,
  recordSearchAliasCanonicalDelivery,
  registerSearchAliasEncounter,
  resolveSearchAliasAttributionState,
  SEARCH_ALIAS_REFERENCE_DISPOSITIONS,
} from "@domain/inspection/search/search-alias-attribution";

describe("search_alias_attribution", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-alias-attribution-"));
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates the empty attribution state", () => {
    expect(createSearchAliasAttributionState()).toEqual({
      aliasReferencesByCanonicalIdentity: {},
      deliveredCanonicalIdentities: [],
    });
  });

  it("normalizes absent persisted states to the empty state", () => {
    expect(resolveSearchAliasAttributionState(undefined)).toEqual(
      createSearchAliasAttributionState(),
    );
    expect(resolveSearchAliasAttributionState(null)).toEqual(
      createSearchAliasAttributionState(),
    );
  });

  it("detaches the persisted state into a working copy", () => {
    const persisted = {
      aliasReferencesByCanonicalIdentity: { "real/target.txt": ["alias/link.txt"] },
      deliveredCanonicalIdentities: ["real/target.txt"],
    };

    const workingCopy = resolveSearchAliasAttributionState(persisted);
    workingCopy.deliveredCanonicalIdentities.push("real/other.txt");
    workingCopy.aliasReferencesByCanonicalIdentity["real/target.txt"]?.push("alias/second.txt");

    expect(persisted.deliveredCanonicalIdentities).toEqual(["real/target.txt"]);
    expect(persisted.aliasReferencesByCanonicalIdentity["real/target.txt"]).toEqual([
      "alias/link.txt",
    ]);
  });

  it("normalizes identity keys across separator styles", () => {
    expect(normalizeSearchAliasIdentityKey("real\\nested\\target.txt")).toBe(
      "real/nested/target.txt",
    );
    expect(normalizeSearchAliasIdentityKey("Real\\Nested\\Target.TXT")).toBe(
      process.platform === "win32" ? "real/nested/target.txt" : "Real/Nested/Target.TXT",
    );
  });

  it("keeps identity key casing on non-Windows platforms", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    try {
      expect(normalizeSearchAliasIdentityKey("Real\\Nested\\Target.TXT")).toBe(
        "Real/Nested/Target.TXT",
      );
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("returns null when the alias vanished before readlink", async () => {
    const state = createSearchAliasAttributionState();

    const event = await registerSearchAliasEncounter({
      aliasAbsolutePath: join(sandboxRootPath, "missing-link.txt"),
      aliasRelativePath: "missing-link.txt",
      state,
      validRootPath: sandboxRootPath,
    });

    expect(event).toBeNull();
    expect(state.aliasReferencesByCanonicalIdentity).toEqual({});
  });

  it("emits an outside-scope event for aliases whose target escapes the root", async () => {
    const outsideRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-alias-outside-"));

    try {
      await writeFile(join(outsideRootPath, "secret.txt"), "outside", "utf8");
      const aliasPath = join(sandboxRootPath, "escape.txt");
      await symlink(join(outsideRootPath, "secret.txt"), aliasPath, "file");
      const state = createSearchAliasAttributionState();

      const event = await registerSearchAliasEncounter({
        aliasAbsolutePath: aliasPath,
        aliasRelativePath: "escape.txt",
        state,
        validRootPath: sandboxRootPath,
      });

      expect(event).toEqual({
        aliasPath: "escape.txt",
        disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.OUTSIDE_SCOPE,
        targetPath: join(outsideRootPath, "secret.txt"),
      });
      expect(state.aliasReferencesByCanonicalIdentity).toEqual({});
    } finally {
      await rm(outsideRootPath, { recursive: true, force: true });
    }
  });

  it("emits an outside-scope event for aliases whose target is the root itself", async () => {
    const aliasPath = join(sandboxRootPath, "self");
    await symlink(sandboxRootPath, aliasPath, "junction");
    const state = createSearchAliasAttributionState();

    const event = await registerSearchAliasEncounter({
      aliasAbsolutePath: aliasPath,
      aliasRelativePath: "self",
      state,
      validRootPath: sandboxRootPath,
    });

    expect(event?.disposition).toBe(SEARCH_ALIAS_REFERENCE_DISPOSITIONS.OUTSIDE_SCOPE);
  });

  it("registers in-root aliases without an event while the target is undelivered", async () => {
    await mkdir(join(sandboxRootPath, "real"), { recursive: true });
    await writeFile(join(sandboxRootPath, "real", "target.txt"), "needle", "utf8");
    const aliasPath = join(sandboxRootPath, "alias.txt");
    await symlink(join(sandboxRootPath, "real", "target.txt"), aliasPath, "file");
    const state = createSearchAliasAttributionState();

    const event = await registerSearchAliasEncounter({
      aliasAbsolutePath: aliasPath,
      aliasRelativePath: "alias.txt",
      state,
      validRootPath: sandboxRootPath,
    });

    expect(event).toBeNull();

    const identityKey = normalizeSearchAliasIdentityKey("real/target.txt");
    expect(state.aliasReferencesByCanonicalIdentity[identityKey]).toEqual(["alias.txt"]);

    const duplicateEvent = await registerSearchAliasEncounter({
      aliasAbsolutePath: aliasPath,
      aliasRelativePath: "alias.txt",
      state,
      validRootPath: sandboxRootPath,
    });

    expect(duplicateEvent).toBeNull();
    expect(state.aliasReferencesByCanonicalIdentity[identityKey]).toEqual(["alias.txt"]);
  });

  it("emits an already-delivered event when the target was delivered before the alias", async () => {
    await mkdir(join(sandboxRootPath, "real"), { recursive: true });
    await writeFile(join(sandboxRootPath, "real", "target.txt"), "needle", "utf8");
    const aliasPath = join(sandboxRootPath, "alias.txt");
    await symlink(join(sandboxRootPath, "real", "target.txt"), aliasPath, "file");
    const state = createSearchAliasAttributionState();

    recordSearchAliasCanonicalDelivery({
      canonicalRelativePath: "real/target.txt",
      state,
    });

    const event = await registerSearchAliasEncounter({
      aliasAbsolutePath: aliasPath,
      aliasRelativePath: "alias.txt",
      state,
      validRootPath: sandboxRootPath,
    });

    expect(event).toEqual({
      aliasPath: "alias.txt",
      disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.ALREADY_DELIVERED,
      targetPath: "real/target.txt",
    });
  });

  it("marks deliveries idempotently and returns the accumulated alias attributions", () => {
    const state = createSearchAliasAttributionState();
    const identityKey = normalizeSearchAliasIdentityKey("real/target.txt");
    state.aliasReferencesByCanonicalIdentity[identityKey] = ["alias/a.txt", "alias/b.txt"];

    expect(
      recordSearchAliasCanonicalDelivery({
        canonicalRelativePath: "real/target.txt",
        state,
      }),
    ).toEqual(["alias/a.txt", "alias/b.txt"]);
    expect(state.deliveredCanonicalIdentities).toEqual([identityKey]);

    recordSearchAliasCanonicalDelivery({
      canonicalRelativePath: "real/target.txt",
      state,
    });

    expect(state.deliveredCanonicalIdentities).toEqual([identityKey]);
    expect(
      recordSearchAliasCanonicalDelivery({
        canonicalRelativePath: "real/untracked.txt",
        state,
      }),
    ).toEqual([]);
  });

  it("formats alias-reference events with their disposition texts", () => {
    expect(formatSearchAliasReferenceEvents([])).toBeNull();

    const formatted = formatSearchAliasReferenceEvents([
      {
        aliasPath: "alias/delivered.txt",
        disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.ALREADY_DELIVERED,
        targetPath: "real/target.txt",
      },
      {
        aliasPath: "alias/escape.txt",
        disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.OUTSIDE_SCOPE,
        targetPath: "C:/outside/secret.txt",
      },
    ]);

    expect(formatted).toBe(
      [
        "Alias references:",
        "  alias/delivered.txt → real/target.txt (already delivered in this session — no new match)",
        "  alias/escape.txt → C:/outside/secret.txt (not searched — link target outside the requested root)",
      ].join("\n"),
    );
  });

  it("collects the deduplicated union of file-group attributions", () => {
    expect(collectSearchAliasFileGroupAttributions([])).toEqual([]);
    expect(
      collectSearchAliasFileGroupAttributions([
        { attributedAliases: ["alias/a.txt", "alias/b.txt"] },
        {},
        { attributedAliases: ["alias/b.txt"] },
      ]),
    ).toEqual(["alias/a.txt", "alias/b.txt"]);
  });
});
