import { FilesystemServer } from "./server.js";
import { initializeLogger } from "./utils/logger.js";

async function main(): Promise<void> {
  const allowedDirectories = process.argv.slice(2);

  if (allowedDirectories.length === 0) {
    console.error("At least one allowed directory must be provided.");
    process.exit(1);
  }

  initializeLogger();

  const server = new FilesystemServer(allowedDirectories);

  await server.connect();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
