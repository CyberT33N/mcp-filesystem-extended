import type { RegisterToolCatalogContext } from "./register-tool-catalog";

import { READ_ONLY_LOCAL_TOOL_ANNOTATIONS } from "./tool-registration-presets";

/**
 * Registers application-owned tools that describe server scope rather than domain behavior.
 */
export function registerServerScopeTools(context: RegisterToolCatalogContext): void {
  const { server, allowedDirectories } = context;

  server.registerTool(
    "list_allowed_directories",
    {
      title: "List allowed directories",
      description:
        "Lists the directory roots this MCP server may access. " +
        "Use this tool to discover the effective filesystem scope before other path-based calls.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
    },
    async () => ({
      content: [
        {
          type: "text",
          text: `Allowed directories:\n${allowedDirectories.join("\n")}`,
        },
      ],
    }),
  );
}
