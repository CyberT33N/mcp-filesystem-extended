import { FilesystemServer } from "@application/server/filesystem-server";
import { initializeLogger } from "@infrastructure/logging/logger";
import { initializeUgrepRuntimeDependency } from "@infrastructure/runtime/ugrep-runtime-dependency";

/**
 * Starts the MCP filesystem server after startup runtime-dependency preflight succeeds.
 *
 * @returns Nothing. The process exits when startup preflight or transport connection fails.
 */
async function main(): Promise<void> {
  const allowedDirectories = process.argv.slice(2);

  if (allowedDirectories.length === 0) {
    console.error("At least one allowed directory must be provided.");
    process.exit(1);
  }

  initializeLogger();
  await initializeUgrepRuntimeDependency();

  const server = new FilesystemServer(allowedDirectories);

  await server.connect();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
