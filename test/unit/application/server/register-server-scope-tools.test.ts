import { describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted annotation fixtures for register-server-scope-tools tests.
 */
const registerServerScopeToolsTestState = vi.hoisted(() => ({
  readOnlyLocalToolAnnotations: {
    audience: "local-read-only",
  },
}));

vi.mock("@application/server/tool-registration-presets", () => ({
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS:
    registerServerScopeToolsTestState.readOnlyLocalToolAnnotations,
}));

import { registerServerScopeTools } from "@application/server/register-server-scope-tools";

describe("register-server-scope-tools", () => {
  it("registers the allowed-directories tool with the expected metadata and callback output", async () => {
    const registerTool = vi.fn();
    const context = {
      server: {
        registerTool,
      },
      allowedDirectories: ["C:/allowed", "C:/second"],
      inspectionResumeSessionStore: {
        cleanupExpiredSessions: vi.fn(),
      },
      executeTool: async () => ({
        content: [],
      }),
    };

    Reflect.apply(registerServerScopeTools, undefined, [context]);

    expect(registerTool).toHaveBeenCalledTimes(1);

    const registrationCall = registerTool.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerTool to receive the server-scope tool registration.");
    }

    const [toolName, registration, callback] = registrationCall;

    expect(toolName).toBe("list_allowed_directories");
    expect(registration).toEqual({
      title: "List allowed directories",
      description:
        "Lists the directory roots this MCP server may access. Use this tool to discover the effective filesystem scope before other path-based calls.",
      annotations:
        registerServerScopeToolsTestState.readOnlyLocalToolAnnotations,
    });

    const result = await callback();

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Allowed directories:\nC:/allowed\nC:/second",
        },
      ],
    });
  });
});
