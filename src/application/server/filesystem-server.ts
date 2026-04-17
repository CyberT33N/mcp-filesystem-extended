import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SetLevelRequestSchema,
  type CallToolResult,
  type LoggingMessageNotification,
} from "@modelcontextprotocol/sdk/types.js";

import {
  createGlobalResponseFuseTriggeredFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { GLOBAL_RESPONSE_HARD_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";

import { registerToolCatalog } from "./register-tool-catalog";
import { SERVER_DESCRIPTION } from "./server-description";
import { SERVER_INSTRUCTIONS } from "./server-instructions";

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
 * Application-layer MCP server shell that owns initialization, logging, tool registration, and the
 * final global response fuse.
 *
 * @remarks
 * This layer is intentionally the last non-bypassable safety floor in the guardrail stack.
 * Family-specific guardrails should already prefer preview-first, range/cursor, or task-backed
 * handling for large valid workloads before a request reaches this shell-level refusal surface,
 * while the server shell converts only still-oversize successful responses into the canonical final
 * refusal.
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

  private measureSuccessfulResponseChars(result: CallToolResult | string): number {
    if (typeof result === "string") {
      return result.length;
    }

    const textContentChars = result.content.reduce(
      (totalChars, contentBlock) =>
        totalChars + (contentBlock.type === "text" ? contentBlock.text.length : 0),
      0,
    );

    const structuredContentChars =
      result.structuredContent === undefined
        ? 0
        : JSON.stringify(result.structuredContent).length;

    return textContentChars + structuredContentChars;
  }

  private createGlobalResponseFuseErrorResult(
    toolName: string,
    responseChars: number,
  ): CallToolResult {
    const failure = createGlobalResponseFuseTriggeredFailure({
      toolName,
      projectedResponseChars: responseChars,
      globalLimitChars: GLOBAL_RESPONSE_HARD_CAP_CHARS,
    });

    return {
      content: [{ type: "text", text: formatToolGuardrailFailureAsText(failure) }],
      isError: true,
    };
  }

  private async executeTool(
    toolName: string,
    action: () => Promise<CallToolResult | string>,
  ): Promise<CallToolResult> {
    try {
      await this.log("info", "tools", { event: "call", tool: toolName });
      const result = await action();
      await this.log("info", "tools", { event: "result", tool: toolName });

      if (typeof result !== "string" && result.isError === true) {
        return result;
      }

      // This global fuse is intentionally the last server-shell safety floor.
      // Family guardrails own preview-first, range/cursor, or task-backed fallback first.
      const successfulResponseChars = this.measureSuccessfulResponseChars(result);

      try {
        assertActualTextBudget(
          toolName,
          successfulResponseChars,
          GLOBAL_RESPONSE_HARD_CAP_CHARS,
          "global successful response fuse",
        );
      } catch {
        await this.log("warning", "tools", {
          event: "global_response_fuse_triggered",
          tool: toolName,
          responseChars: successfulResponseChars,
          globalResponseHardCapChars: GLOBAL_RESPONSE_HARD_CAP_CHARS,
        });

        return this.createGlobalResponseFuseErrorResult(toolName, successfulResponseChars);
      }

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
   * @remarks
   * The transport layer exposes the already-harmonized caller contract, including the stable server
   * instructions and the non-bypassable global response fuse owned by this class.
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
