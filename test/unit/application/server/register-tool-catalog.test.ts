import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted delegation mocks for register-tool-catalog tests.
 */
const registerToolCatalogTestState = vi.hoisted(() => ({
  registerInspectionToolCatalog: vi.fn(),
  registerComparisonAndMutationToolCatalog: vi.fn(),
  registerServerScopeTools: vi.fn(),
}));

vi.mock("@application/server/register-inspection-tool-catalog", () => ({
  registerInspectionToolCatalog:
    registerToolCatalogTestState.registerInspectionToolCatalog,
}));

vi.mock(
  "@application/server/register-comparison-and-mutation-tool-catalog",
  () => ({
    registerComparisonAndMutationToolCatalog:
      registerToolCatalogTestState.registerComparisonAndMutationToolCatalog,
  }),
);

vi.mock("@application/server/register-server-scope-tools", () => ({
  registerServerScopeTools:
    registerToolCatalogTestState.registerServerScopeTools,
}));

import { registerToolCatalog } from "@application/server/register-tool-catalog";

describe("register-tool-catalog", () => {
  beforeEach(() => {
    registerToolCatalogTestState.registerInspectionToolCatalog.mockClear();
    registerToolCatalogTestState.registerComparisonAndMutationToolCatalog.mockClear();
    registerToolCatalogTestState.registerServerScopeTools.mockClear();
  });

  it("delegates the full tool catalog registration to the bounded application modules in order", () => {
    const context = {
      server: {
        registerTool: vi.fn(),
      },
      allowedDirectories: ["C:/allowed"],
      inspectionResumeSessionStore: {
        cleanupExpiredSessions: vi.fn(),
      },
      executeTool: async () => ({
        content: [],
      }),
    };

    Reflect.apply(registerToolCatalog, undefined, [context]);

    expect(
      registerToolCatalogTestState.registerInspectionToolCatalog,
    ).toHaveBeenNthCalledWith(1, context);
    expect(
      registerToolCatalogTestState.registerComparisonAndMutationToolCatalog,
    ).toHaveBeenNthCalledWith(1, context);
    expect(
      registerToolCatalogTestState.registerServerScopeTools,
    ).toHaveBeenNthCalledWith(1, context);
  });
});
