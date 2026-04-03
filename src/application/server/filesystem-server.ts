import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SetLevelRequestSchema,
  type CallToolResult,
  type LoggingMessageNotification,
} from "@modelcontextprotocol/sdk/types.js";

import { registerToolCatalog } from "./register-tool-catalog.js";
import { SERVER_DESCRIPTION } from "./server-description.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";

type LoggingLevel = LoggingMessageNotification["params"]["level"];

const LOG_LEVEL_MAP: Record<LoggingLevel, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

/**
 * Application-layer MCP server shell that owns initialization, logging, and tool registration.
 */
export class FilesystemServer {
  private readonly server: McpServer;
  private readonly allowedDirectories: string[];
  private rootLogLevel: LoggingLevel = "info";

  /**
   * Creates the filesystem MCP server for one allowed-directory scope set.
   *
   * @param allowedDirectories - Filesystem roots that bound all tool access.
   */
  constructor(allowedDirectories: string[]) {
    this.allowedDirectories = allowedDirectories;

    this.server = new McpServer(
      {
        name: "mcp-filesystem-extended",
        version: "0.6.2",
        description: SERVER_DESCRIPTION,
      },
      {
        instructions: SERVER_INSTRUCTIONS,
        capabilities: {
          logging: {},
        },
      },
    );

    this.setupRequestHandlers();
    registerToolCatalog({
      server: this.server,
      allowedDirectories: this.allowedDirectories,
      executeTool: (toolName, action) => this.executeTool(toolName, action),
    });
  }

  private shouldLog(level: LoggingLevel): boolean {
    return LOG_LEVEL_MAP[level] <= LOG_LEVEL_MAP[this.rootLogLevel];
  }

  private async log(
    level: LoggingLevel,
    logger: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!this.shouldLog(level)) {
        return;
      }

      await this.server.sendLoggingMessage({ level, logger, data });
    } catch {
      // Never throw from the logging path.
    }
  }

  private setupRequestHandlers(): void {
    this.server.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      this.rootLogLevel = request.params.level;
      await this.log("debug", "logging", {
        message: `Root log level set to '${request.params.level}'`,
      });
      return {};
    });
  }

  private async executeTool(
    toolName: string,
    action: () => Promise<CallToolResult | string>,
  ): Promise<CallToolResult> {
    try {
      await this.log("info", "tools", { event: "call", tool: toolName });
      const result = await action();
      await this.log("info", "tools", { event: "result", tool: toolName });

      if (typeof result !== "string") {
        return result;
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.log("error", "tools", {
        event: "error",
        tool: toolName,
        error: errorMessage,
      });

      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Connects the server to the stdio transport and begins serving requests.
   *
   * @returns Nothing. The method resolves once the MCP transport is connected.
   */
  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("MCP Filesystem Extended Server running on stdio");
    console.error("Allowed directories:", this.allowedDirectories);
    await this.log("info", "main", { message: "Server connected via stdio" });
  }
}
