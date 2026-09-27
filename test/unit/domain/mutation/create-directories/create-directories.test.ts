import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleCreateDirectories } from "@domain/mutation/create-directories/handler";
import { CreateDirectoriesArgsSchema } from "@domain/mutation/create-directories/schema";

/**
 * Hoisted mock state used to drive the non-Error defensive branches of the batch guard
 * and the per-path validation failure surface.
 */
const createDirectoriesMockState = vi.hoisted(() => ({
  mockedAssertPathMutationBatchBudget: vi.fn(),
  mockedValidatePathForCreation: vi.fn(),
}));

vi.mock("@domain/mutation/shared/mutation-guardrails", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("@domain/mutation/shared/mutation-guardrails")>();

  createDirectoriesMockState.mockedAssertPathMutationBatchBudget.mockImplementation(
    originalModule.assertPathMutationBatchBudget,
  );

  return {
    ...originalModule,
    assertPathMutationBatchBudget: createDirectoriesMockState.mockedAssertPathMutationBatchBudget,
  };
});

vi.mock("@infrastructure/filesystem/path-guard", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("@infrastructure/filesystem/path-guard")>();

  createDirectoriesMockState.mockedValidatePathForCreation.mockImplementation(
    originalModule.validatePathForCreation,
  );

  return {
    ...originalModule,
    validatePathForCreation: createDirectoriesMockState.mockedValidatePathForCreation,
  };
});

describe("create_directories", () => {
  let sandboxRootPath = "";
  let allowedDirectories: string[] = [];

  beforeEach(async () => {
    sandboxRootPath = await mkdtemp(
      join(tmpdir(), "mcp-fs-create-directories-"),
    );
    allowedDirectories = [sandboxRootPath];
  });

  afterEach(async () => {
    if (sandboxRootPath !== "") {
      await rm(sandboxRootPath, { recursive: true, force: true });
    }
  });

  it("creates every requested directory path within the allowed roots", async () => {
    const firstDirectoryPath = join(sandboxRootPath, "logs");
    const secondDirectoryPath = join(sandboxRootPath, "nested", "daily");

    await handleCreateDirectories(
      [firstDirectoryPath, secondDirectoryPath],
      allowedDirectories,
    );

    expect((await stat(firstDirectoryPath)).isDirectory()).toBe(true);
    expect((await stat(secondDirectoryPath)).isDirectory()).toBe(true);
  });

  it("parses one or more requested directory paths through the schema", () => {
    const parsed = CreateDirectoriesArgsSchema.parse({
      paths: ["logs", "artifacts/daily"],
    });

    expect(parsed.paths).toEqual(["logs", "artifacts/daily"]);
  });

  it("returns the guardrail message when the batch exceeds the path-mutation ceiling", async () => {
    const paths = Array.from(
      { length: 201 },
      (_, index) => join(sandboxRootPath, `dir-${index}`),
    );

    const output = await handleCreateDirectories(paths, allowedDirectories);

    expect(output).toContain("create_directories");
  });

  it("keeps directory-level failures in the batch summary", async () => {
    const outsidePath = join(tmpdir(), "outside-create-directory");

    const output = await handleCreateDirectories(
      [join(sandboxRootPath, "inside"), outsidePath],
      allowedDirectories,
    );

    expect(output).toContain("1 directories processed successfully");
    expect(output).toContain("1 directories failed");
    expect(output).toContain("Failed to create directory");
  });

  it("returns the stringified refusal when the batch guard throws a non-Error value", async () => {
    createDirectoriesMockState.mockedAssertPathMutationBatchBudget.mockImplementationOnce(() => {
      throw "raw guardrail refusal";
    });

    const output = await handleCreateDirectories(
      [join(sandboxRootPath, "guarded")],
      allowedDirectories,
    );

    expect(output).toBe("raw guardrail refusal");
  });

  it("keeps non-Error directory-level failures in the batch summary", async () => {
    const failingPath = join(sandboxRootPath, "raw-failure");

    createDirectoriesMockState.mockedValidatePathForCreation.mockImplementationOnce(() => {
      throw "raw validation failure";
    });

    const output = await handleCreateDirectories([failingPath], allowedDirectories);

    expect(output).toContain(`Failed to create directory ${failingPath}: raw validation failure`);
  });
});
