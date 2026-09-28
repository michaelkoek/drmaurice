import { describe, expect, it } from "vitest";
import { PASSWORD_MAX, passwordError, passwordRules } from "@/lib/password";

describe("password rules", () => {
  it("accepts a password that meets every rule", () => {
    expect(passwordError("Hartslag-72bpm", "maurice@example.com")).toBeNull();
    expect(passwordRules("Hartslag-72bpm").every((r) => r.ok)).toBe(true);
  });

  it.each([
    ["Kort-1a", "length"],
    ["HARTSLAG-72BPM", "lower"],
    ["hartslag-72bpm", "upper"],
    ["Hartslag-bpm!", "digit"],
    ["Hartslag72bpm", "symbol"],
  ])("rejects %s (%s)", (pw, rule) => {
    expect(passwordRules(pw).find((r) => r.id === rule)?.ok).toBe(false);
    expect(passwordError(pw)).not.toBeNull();
  });

  it("rejects passwords containing the email name", () => {
    expect(passwordError("Maurice-2026!", "maurice@example.com")).toMatch(/e-mailnaam/);
    expect(passwordError("Maurice-2026!", "mo@example.com")).toBeNull();
  });

  it("counts accented letters as upper/lower case", () => {
    expect(passwordError("Élève-école-9")).toBeNull();
  });

  it("rejects passwords over the maximum length", () => {
    expect(passwordError("Aa1!" + "x".repeat(PASSWORD_MAX))).toMatch(/hoogstens/);
  });
});
