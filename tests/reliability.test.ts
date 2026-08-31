import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { Prisma } from "@prisma/client";
import { mapBookingConflict } from "../src/lib/services/availability";
import { bookingErrorFr, messageStatusFr } from "../src/lib/copy";
import {
  EXAMPLE_OPERATOR_PASSWORD,
  resolveOperatorCredentials,
} from "../src/lib/seedOperator";

describe("booking conflict mapping", () => {
  it("keeps SLOT_TAKEN and ALREADY_SCHEDULED", () => {
    expect(mapBookingConflict(new Error("SLOT_TAKEN")).message).toBe("SLOT_TAKEN");
    expect(mapBookingConflict(new Error("ALREADY_SCHEDULED")).message).toBe("ALREADY_SCHEDULED");
  });

  it("maps unique contact constraint to ALREADY_SCHEDULED", () => {
    const err = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["appointments_one_scheduled_per_contact"] },
    });
    expect(mapBookingConflict(err).message).toBe("ALREADY_SCHEDULED");
  });

  it("maps gist exclusion to SLOT_TAKEN", () => {
    expect(mapBookingConflict(new Error("23P01 exclusion appointments_no_overlap_scheduled")).message).toBe(
      "SLOT_TAKEN",
    );
  });
});

describe("staff-visible send and booking errors", () => {
  it("surfaces template failures", () => {
    expect(messageStatusFr("failed", "400 (#132001) Template name does not exist")).toMatch(/Modèle WhatsApp/);
  });

  it("surfaces unknown WhatsApp delivery", () => {
    expect(messageStatusFr("failed", "send_outcome_unknown")).toMatch(/incertain/);
  });

  it("explains slot conflicts", () => {
    expect(bookingErrorFr("slot")).toMatch(/n’est plus disponible/);
  });
});

describe("operator seed safety", () => {
  it("never falls back to the example password", () => {
    expect(() => resolveOperatorCredentials({ NODE_ENV: "development" })).toThrow(/SELAREN_OPERATOR_PASSWORD/);
    expect(() =>
      resolveOperatorCredentials({ NODE_ENV: "production", SELAREN_OPERATOR_PASSWORD: EXAMPLE_OPERATOR_PASSWORD }),
    ).toThrow(/example password/);
  });

  it("requires a real password in production", () => {
    const creds = resolveOperatorCredentials({
      NODE_ENV: "production",
      SELAREN_OPERATOR_EMAIL: "ops@selaren.test",
      SELAREN_OPERATOR_PASSWORD: "a-real-production-password",
    });
    expect(creds.resetPassword).toBe(false);
    expect(creds.password).toBe("a-real-production-password");
  });
});

describe("railway build contract", () => {
  it("keeps esbuild as a build-only dependency and documents full npm ci at build", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.esbuild).toBeTruthy();
    expect(pkg.dependencies.esbuild).toBeUndefined();
    expect(pkg.scripts.build).not.toMatch(/omit=dev/);
    expect(pkg.scripts.worker).toBe("node dist/worker.js");
    const nix = readFileSync("nixpacks.toml", "utf8");
    expect(nix).toMatch(/cmds = \["npm ci"\]/);
    expect(nix).not.toMatch(/cmds = \["npm ci --omit=dev"\]/);
  });
});

describe("health payload", () => {
  it("returns 503 shape when the database is unreachable", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/db", () => ({
      prisma: {
        $queryRaw: vi.fn(async () => {
          throw new Error("P1001");
        }),
      },
    }));
    const { getHealth } = await import("../src/lib/health");
    const health = await getHealth();
    expect(health.ok).toBe(false);
    expect(health.service).toBe("selaren");
    expect(JSON.stringify(health)).not.toMatch(/postgresql:\/\//);
  });
});
