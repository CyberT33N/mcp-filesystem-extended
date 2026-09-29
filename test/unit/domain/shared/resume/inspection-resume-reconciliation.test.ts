import { describe, expect, it } from "vitest";

import {
  INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES,
  reconcileInspectionResumeFrontierTruthfulness,
} from "@domain/shared/resume/inspection-resume-reconciliation";

describe("inspection_resume_reconciliation", () => {
  it("exposes the canonical reconciliation status vocabulary", () => {
    expect(INSPECTION_RESUME_FRONTIER_RECONCILIATION_STATUSES).toEqual({
      RECONCILED: "reconciled",
      DIVERGED: "diverged",
    });
  });

  it("reconciles a pass whose frontier and accounting agree with the delivered payload", () => {
    expect(
      reconcileInspectionResumeFrontierTruthfulness({
        previouslyDeliveredCount: 4,
        currentPassDeliveredCount: 2,
        sessionTotalCount: 6,
        discardedDirectories: [],
      }),
    ).toEqual({
      status: "reconciled",
      divergenceReason: null,
      discardedDirectories: [],
    });
  });

  it("diverges when a directory frame was discarded without delivery", () => {
    const verdict = reconcileInspectionResumeFrontierTruthfulness({
      previouslyDeliveredCount: 4,
      currentPassDeliveredCount: 2,
      sessionTotalCount: 6,
      discardedDirectories: [
        { requestedPath: "/repo/src", directoryRelativePath: "prompts/system" },
      ],
    });

    expect(verdict.status).toBe("diverged");
    expect(verdict.divergenceReason).toContain(
      "1 directory discarded from the traversal frontier without delivery",
    );
    expect(verdict.discardedDirectories).toEqual([
      { requestedPath: "/repo/src", directoryRelativePath: "prompts/system" },
    ]);
  });

  it("diverges when the session-cumulative accounting does not equal the delivered passes", () => {
    const verdict = reconcileInspectionResumeFrontierTruthfulness({
      previouslyDeliveredCount: 4,
      currentPassDeliveredCount: 2,
      sessionTotalCount: 7,
      discardedDirectories: [],
    });

    expect(verdict.status).toBe("diverged");
    expect(verdict.divergenceReason).toContain("delivery accounting divergence");
    expect(verdict.divergenceReason).toContain("session total 7");
    expect(verdict.discardedDirectories).toEqual([]);
  });

  it("composes both divergence reasons when the frontier and the accounting diverge together", () => {
    const verdict = reconcileInspectionResumeFrontierTruthfulness({
      previouslyDeliveredCount: 4,
      currentPassDeliveredCount: 2,
      sessionTotalCount: 7,
      discardedDirectories: [
        { requestedPath: "/repo/src", directoryRelativePath: "prompts/system" },
        { requestedPath: "/repo/docs", directoryRelativePath: "" },
      ],
    });

    expect(verdict.status).toBe("diverged");
    expect(verdict.divergenceReason).toContain(
      "2 directories discarded from the traversal frontier without delivery",
    );
    expect(verdict.divergenceReason).toContain("delivery accounting divergence");
    expect(verdict.discardedDirectories).toHaveLength(2);
  });
});
