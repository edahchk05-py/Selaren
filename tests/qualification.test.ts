import { describe, expect, it } from "vitest";
import {
  applyQualificationPatch,
  computeQualificationStatus,
  shouldAutoClose,
  type QualificationInput,
} from "../src/lib/qualification";

const base: QualificationInput = {
  status: "unevaluated",
  treatmentId: null,
  treatmentLabel: null,
  intent: "unknown",
  canAttendClinic: "unknown",
  disqualifyReason: null,
  notes: "",
  lockedByStaff: false,
};

describe("qualification", () => {
  it("requires treatment + book + can attend", () => {
    expect(
      computeQualificationStatus({
        ...base,
        treatmentLabel: "implants",
        intent: "book",
        canAttendClinic: "yes",
      }),
    ).toBe("qualified");
    expect(
      computeQualificationStatus({
        ...base,
        treatmentLabel: "implants",
        intent: "information",
        canAttendClinic: "yes",
      }),
    ).toBe("in_progress");
  });

  it("auto-closes spam and wrong number only", () => {
    expect(shouldAutoClose("spam")).toBe(true);
    expect(shouldAutoClose("wrong_number")).toBe(true);
    expect(shouldAutoClose("no_intent")).toBe(false);
  });

  it("staff lock blocks AI writes", () => {
    const locked = { ...base, lockedByStaff: true, treatmentLabel: "veneers" };
    const next = applyQualificationPatch(locked, { treatmentLabel: "spam" }, { byStaff: false });
    expect(next.treatmentLabel).toBe("veneers");
  });
});
