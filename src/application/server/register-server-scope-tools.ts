import type { RegisterToolCatalogContext } from "./register-tool-catalog";

import {
  buildListAllowedDirectoriesToolDescription,
  READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
} from "./tool-registration-presets";

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
        buildListAllowedDirectoriesToolDescription(),
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
