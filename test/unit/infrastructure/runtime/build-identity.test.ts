import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveBuildIdentity } from "@infrastructure/runtime/build-identity";

/**
 * Reads the workspace manifest version directly so the resolver is asserted against the manifest
 * itself rather than against a hardcoded expectation.
 *
 * @returns The version declared by the workspace package manifest.
 */
function readWorkspaceManifestVersion(): string {
  const manifestPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    "package.json",
  );
  const parsedManifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (
    typeof parsedManifest !== "object"
    || parsedManifest === null
    || !("version" in parsedManifest)
    || typeof parsedManifest.version !== "string"
  ) {
    throw new Error("Expected the workspace manifest to carry a string version.");
  }

  return parsedManifest.version;
}

describe("build-identity", () => {
  let sandboxRootPath = "";

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(join(tmpdir(), "mcp-fs-build-identity-"));
  });

  afterEach(async () => {
    await rm(sandboxRootPath, { recursive: true, force: true });
  });

  it("resolves the running process identity from the workspace manifest and the module file", () => {
    const identity = resolveBuildIdentity();

    expect(identity.packageVersion).toBe(readWorkspaceManifestVersion());
    expect(identity.bundleSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity.nodeVersion).toBe(process.version);
    expect(identity.processId).toBe(process.pid);
  });

  it("fails deterministically when no workspace manifest is reachable from the start directory", () => {
    expect(() => resolveBuildIdentity({ startDirectory: sandboxRootPath })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );
  });

  it("stops the manifest ascent at the filesystem root", () => {
    expect(() => resolveBuildIdentity({ startDirectory: parse(process.cwd()).root })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );
  });

  it("skips malformed and foreign manifests while ascending and then fails deterministically", async () => {
    const manifestPath = join(sandboxRootPath, "package.json");

    await writeFile(manifestPath, "42");
    expect(() => resolveBuildIdentity({ startDirectory: sandboxRootPath })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );

    await writeFile(manifestPath, JSON.stringify({ name: "mcp-filesystem-extended" }));
    expect(() => resolveBuildIdentity({ startDirectory: sandboxRootPath })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );

    await writeFile(manifestPath, JSON.stringify({ name: 42, version: "0.0.1" }));
    expect(() => resolveBuildIdentity({ startDirectory: sandboxRootPath })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );

    await writeFile(manifestPath, JSON.stringify({ name: "foreign-package", version: "0.0.1" }));
    expect(() => resolveBuildIdentity({ startDirectory: sandboxRootPath })).toThrow(
      "Unable to resolve the mcp-filesystem-extended package manifest",
    );
  });
});
