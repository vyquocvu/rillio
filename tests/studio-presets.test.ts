import { describe, it, expect } from "vitest";
import { STUDIO_PRESETS, getDefaultPropsForPreset } from "../examples/studio-presets";

describe("Studio Presets and Code Generation", () => {
  it("provides valid presets with unique identifiers", () => {
    expect(STUDIO_PRESETS.length).toBeGreaterThanOrEqual(3);
    const ids = STUDIO_PRESETS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("extracts default props accurately", () => {
    const counterPreset = STUDIO_PRESETS.find(p => p.id === "counter")!;
    const defaults = getDefaultPropsForPreset(counterPreset);
    expect(defaults.label).toBe("Clicks");
    expect(defaults.step).toBe(1);
    expect(defaults.showReset).toBe(true);
  });

  it("generates runnable code containing preset properties", () => {
    const counterPreset = STUDIO_PRESETS.find(p => p.id === "counter")!;
    const code = counterPreset.generateCode({ label: "Votes", step: 5, showReset: false });
    expect(code).toContain("Votes");
    expect(code).toContain("c + 5");
    expect(code).not.toContain("Reset");
  });

  it("handles empty or default overrides gracefully", () => {
    const cardPreset = STUDIO_PRESETS.find(p => p.id === "reactive-card")!;
    const code = cardPreset.generateCode({});
    expect(code).toContain("@vyquocvu/rillio");
    expect(code).toContain("Status Card");
  });
});
