import { describe, expect, it } from "vitest";

import { SERVER_DESCRIPTION } from "@application/server/server-description";

describe("server-description", () => {
  it("exports the stable MCP server description surface", () => {
    expect(SERVER_DESCRIPTION).toBe(
      "Extended local filesystem MCP server with bounded inspection, comparison, mutation, and server-scope surfaces, layered response guardrails, and same-endpoint resume-aware inspection workflows.",
    );
  });
});
