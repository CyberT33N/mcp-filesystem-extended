import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores hoisted constructor, transport, and registration mocks for filesystem-server tests.
 */
const filesystemServerTestState = vi.hoisted(() => {
  const cleanupExpiredSessions = vi.fn();
  const vacuum = vi.fn();
  const inspectionResumeSessionStore = {
    cleanupExpiredSessions,
    vacuum,
  };
  const inspectionResumeSessionStoreConstructor = vi.fn(
    () => inspectionResumeSessionStore,
  );
  const sendLoggingMessage = vi.fn(async () => undefined);
  const connect = vi.fn(async () => undefined);
  const setRequestHandler = vi.fn();
  const registerTool = vi.fn();
  const serverInstance = {
    server: {
      setRequestHandler,
    },
    sendLoggingMessage,
    connect,
    registerTool,
  };
  const mcpServerConstructor = vi.fn(() => serverInstance);
  const transportInstance = {
    transport: "stdio",
  };
  const stdioServerTransportConstructor = vi.fn(() => transportInstance);
  const registerToolCatalog = vi.fn();
  const getUgrepRuntimeDependency = vi.fn();
  const setLevelRequestSchema = {
    name: "set-level-request-schema",
  };

  return {
    cleanupExpiredSessions,
    vacuum,
    inspectionResumeSessionStore,
    inspectionResumeSessionStoreConstructor,
    sendLoggingMessage,
    connect,
    setRequestHandler,
    registerTool,
    serverInstance,
    mcpServerConstructor,
    transportInstance,
    stdioServerTransportConstructor,
    registerToolCatalog,
    getUgrepRuntimeDependency,
    setLevelRequestSchema,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: filesystemServerTestState.mcpServerConstructor,
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport:
    filesystemServerTestState.stdioServerTransportConstructor,
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  SetLevelRequestSchema: filesystemServerTestState.setLevelRequestSchema,
}));

vi.mock(
  "@infrastructure/persistence/inspection-resume-session-sqlite-store",
  () => ({
    InspectionResumeSessionSqliteStore:
      filesystemServerTestState.inspectionResumeSessionStoreConstructor,
  }),
);

vi.mock("@infrastructure/runtime/ugrep-runtime-dependency", () => ({
  getUgrepRuntimeDependency: filesystemServerTestState.getUgrepRuntimeDependency,
}));

vi.mock("@application/server/register-tool-catalog", () => ({
  registerToolCatalog: filesystemServerTestState.registerToolCatalog,
}));

vi.mock("@application/server/server-description", () => ({
  SERVER_DESCRIPTION: "server description",
}));

vi.mock("@application/server/server-instructions", () => ({
  SERVER_INSTRUCTIONS: "server instructions",
}));

import { FilesystemServer } from "@application/server/filesystem-server";

describe("filesystem-server", () => {
  beforeEach(() => {
    filesystemServerTestState.cleanupExpiredSessions.mockClear();
    filesystemServerTestState.vacuum.mockClear();
    filesystemServerTestState.inspectionResumeSessionStoreConstructor.mockClear();
    filesystemServerTestState.sendLoggingMessage.mockClear();
    filesystemServerTestState.connect.mockClear();
    filesystemServerTestState.setRequestHandler.mockClear();
    filesystemServerTestState.registerTool.mockClear();
    filesystemServerTestState.mcpServerConstructor.mockClear();
    filesystemServerTestState.stdioServerTransportConstructor.mockClear();
    filesystemServerTestState.registerToolCatalog.mockClear();
    filesystemServerTestState.getUgrepRuntimeDependency.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs the MCP server shell and registers the root tool catalog", () => {
    new FilesystemServer(["C:/allowed"]);

    expect(
      filesystemServerTestState.inspectionResumeSessionStoreConstructor,
    ).toHaveBeenCalledOnce();
    expect(filesystemServerTestState.cleanupExpiredSessions).toHaveBeenCalledOnce();
    expect(filesystemServerTestState.vacuum).toHaveBeenCalledOnce();
    expect(
      filesystemServerTestState.getUgrepRuntimeDependency,
    ).toHaveBeenCalledOnce();
    expect(filesystemServerTestState.mcpServerConstructor).toHaveBeenCalledWith(
      {
        name: "mcp-filesystem-extended",
        version: "0.6.2",
        description: "server description",
      },
      {
        instructions: "server instructions",
        capabilities: {
          logging: {},
        },
      },
    );
    expect(filesystemServerTestState.setRequestHandler).toHaveBeenCalledWith(
      filesystemServerTestState.setLevelRequestSchema,
      expect.any(Function),
    );
    expect(filesystemServerTestState.registerToolCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        server: filesystemServerTestState.serverInstance,
        allowedDirectories: ["C:/allowed"],
        inspectionResumeSessionStore:
          filesystemServerTestState.inspectionResumeSessionStore,
        executeTool: expect.any(Function),
      }),
    );
  });

  it("wraps successful tool execution through the registered executeTool callback", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall =
      filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }

    const [catalogContext] = registrationCall;
    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => "Allowed directories:\nC:/allowed",
    );

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Allowed directories:\nC:/allowed",
        },
      ],
    });
    expect(filesystemServerTestState.sendLoggingMessage).toHaveBeenCalledWith({
      level: "info",
      logger: "tools",
      data: {
        event: "call",
        tool: "list_allowed_directories",
      },
    });
    expect(filesystemServerTestState.sendLoggingMessage).toHaveBeenCalledWith({
      level: "info",
      logger: "tools",
      data: {
        event: "result",
        tool: "list_allowed_directories",
      },
    });
  });

  it("connects the stdio transport and logs server startup", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const filesystemServer = new FilesystemServer(["C:/allowed"]);

    await filesystemServer.connect();

    expect(
      filesystemServerTestState.stdioServerTransportConstructor,
    ).toHaveBeenCalledOnce();
    expect(filesystemServerTestState.connect).toHaveBeenCalledWith(
      filesystemServerTestState.transportInstance,
    );
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      "MCP Filesystem Extended Server running on stdio",
    );
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      "Allowed directories:",
      ["C:/allowed"],
    );
    expect(filesystemServerTestState.sendLoggingMessage).toHaveBeenCalledWith({
      level: "info",
      logger: "main",
      data: {
        message: "Server connected via stdio",
      },
    });
  });

  it("applies the set-level request handler and filters logs below the root level", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const setLevelCall = filesystemServerTestState.setRequestHandler.mock.calls[0];
    if (setLevelCall === undefined) {
      throw new Error("Expected a set-level request handler registration.");
    }
    const setLevelHandler = setLevelCall[1];

    await setLevelHandler({ params: { level: "warning" } });

    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => "ok",
    );

    expect(result).toEqual({ content: [{ text: "ok", type: "text" }] });
    expect(
      filesystemServerTestState.sendLoggingMessage.mock.calls.filter(
        ([message]) => message.logger === "tools",
      ),
    ).toHaveLength(0);
  });

  it("never throws from the logging path when the transport rejects", async () => {
    filesystemServerTestState.sendLoggingMessage.mockRejectedValueOnce(
      new Error("transport down"),
    );
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => "ok",
    );

    expect(result).toEqual({ content: [{ text: "ok", type: "text" }] });
  });

  it("measures structured tool results against the global fuse and returns them unchanged", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const toolResult = {
      content: [{ text: "structured ok", type: "text" as const }],
      structuredContent: { ok: true },
    };
    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => toolResult,
    );
    expect(result).toBe(toolResult);

    const textOnlyResult = {
      content: [{ text: "plain ok", type: "text" as const }],
    };
    const secondResult = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => textOnlyResult,
    );
    expect(secondResult).toBe(textOnlyResult);

    const nonTextResult = {
      content: [{ data: "aGk=", mimeType: "image/png", type: "image" as const }],
    };
    const thirdResult = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => nonTextResult,
    );
    expect(thirdResult).toBe(nonTextResult);
  });

  it("passes error results through without touching the global fuse", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const errorResult = {
      content: [{ text: "broken", type: "text" as const }],
      isError: true,
    };
    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => errorResult,
    );

    expect(result).toBe(errorResult);
  });

  it("converts oversized successful results into the canonical global-fuse refusal", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const oversized = "x".repeat(600_001);
    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => oversized,
    );

    expect(result.isError).toBe(true);
    const block = result.content[0];
    if (block?.type === "text") {
      expect(block.text).toContain("global response fuse");
      expect(block.text).toContain("600,000");
    }
    expect(filesystemServerTestState.sendLoggingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warning", logger: "tools" }),
    );
  });

  it("converts thrown tool errors into canonical error results", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => {
        throw new Error("handler exploded");
      },
    );

    expect(result.isError).toBe(true);
    const block = result.content[0];
    if (block?.type === "text") {
      expect(block.text).toBe("Error: handler exploded");
    }
  });

  it("stringifies non-Error tool failures", async () => {
    new FilesystemServer(["C:/allowed"]);

    const registrationCall = filesystemServerTestState.registerToolCatalog.mock.calls[0];
    if (registrationCall === undefined) {
      throw new Error("Expected registerToolCatalog to receive an execution context.");
    }
    const [catalogContext] = registrationCall;

    const result = await catalogContext.executeTool(
      "list_allowed_directories",
      async () => {
        throw "raw failure";
      },
    );

    expect(result.isError).toBe(true);
    const block = result.content[0];
    if (block?.type === "text") {
      expect(block.text).toBe("Error: raw failure");
    }
  });
});
