import { FilesystemServer } from "./server.js";

const allowedDirectories = process.argv.slice(2);

if (allowedDirectories.length === 0) {
  console.error("At least one allowed directory must be provided.");
  process.exit(1);
}

const server = new FilesystemServer(allowedDirectories);

await server.connect();
