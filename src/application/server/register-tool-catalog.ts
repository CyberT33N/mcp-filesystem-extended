import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { InspectionResumeSessionSqliteStore } from "@infrastructure/persistence/inspection-resume-session-sqlite-store";

import { registerComparisonAndMutationToolCatalog } from "./register-comparison-and-mutation-tool-catalog";
import { registerInspectionToolCatalog } from "./register-inspection-tool-catalog";
import { registerServerScopeTools } from "./register-server-scope-tools";

/**
 * Callback shape used to wrap tool execution in the application-layer server shell.
 */
export type ToolExecutor = (
  toolName: string,
  action: () => Promise<CallToolResult | string>,
) => Promise<CallToolResult>;

/**
 * Inputs required to register the full filesystem tool catalog.
 */
export interface RegisterToolCatalogContext {
  /**
   * MCP server instance that owns the tool surface.
   */
  server: McpServer;

  /**
   * Allowed filesystem roots used by the handler layer.
   */
  allowedDirectories: string[];

  /**
   * Shared server-owned resume-session persistence surface for inspection families.
   */
  inspectionResumeSessionStore: InspectionResumeSessionSqliteStore;

  /**
   * Stable application-layer wrapper for logging, result normalization, and error handling.
   */
  executeTool: ToolExecutor;
}

/**
 * Registers the complete filesystem tool catalog by delegating to bounded application modules.
 *
 * @param context - Tool-registration dependencies owned by the application server shell.
 * @returns Nothing. The tool surface is registered directly on the provided server instance.
 */
export function registerToolCatalog(context: RegisterToolCatalogContext): void {
  registerInspectionToolCatalog(context);
  registerComparisonAndMutationToolCatalog(context);
  registerServerScopeTools(context);
}
