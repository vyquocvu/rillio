// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { runInBrowserBenchmark } from "../examples/studio-benchmark";

describe("Studio Benchmark Engine", () => {
  it("runs benchmark suite across specified count and returns clean metrics", () => {
    const results = runInBrowserBenchmark(100);
    expect(results.length).toBe(4);
    
    const operations = results.map(r => r.operation);
    expect(operations).toEqual(["mount", "update", "reorder", "clear"]);

    for (const r of results) {
      expect(r.itemCount).toBe(100);
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(r.opsPerSecond).toBeGreaterThanOrEqual(0);
    }
  });

  it("scales to 1000 items without error", () => {
    const results = runInBrowserBenchmark(1000);
    expect(results.length).toBe(4);
    expect(results[0].itemCount).toBe(1000);
  });
});
