import { describe, expect, it } from "vitest";
import { formatMinutes } from "./formatTime";

describe("formatMinutes", () => {
  it("keeps two-digit minute counts as minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(9)).toBe("9m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(99)).toBe("99m");
  });

  it("switches to hours+minutes once it would be three digits", () => {
    expect(formatMinutes(100)).toBe("1h 40m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(200)).toBe("3h 20m");
    expect(formatMinutes(480)).toBe("8h");
  });

  it("rounds and clamps defensively", () => {
    expect(formatMinutes(45.4)).toBe("45m");
    expect(formatMinutes(-5)).toBe("0m");
  });
});
