export interface BenchmarkRunResult {
  itemCount: number;
  operation: "mount" | "reorder" | "update" | "clear";
  durationMs: number;
  opsPerSecond: number;
}

/**
 * Runs a localized addressable in-memory benchmark simulating N nodes.
 */
export function runInBrowserBenchmark(count: number): BenchmarkRunResult[] {
  const results: BenchmarkRunResult[] = [];

  // 1. Mount simulation
  const t0 = performance.now();
  let items = Array.from({ length: count }, (_, i) => ({ id: i, val: `Item ${i}` }));
  const t1 = performance.now();
  const mountDuration = Math.max(0.01, t1 - t0);
  results.push({
    itemCount: count,
    operation: "mount",
    durationMs: Number(mountDuration.toFixed(2)),
    opsPerSecond: Math.round((count / mountDuration) * 1000),
  });

  // 2. Update simulation (updating 100% of properties)
  const t2 = performance.now();
  items = items.map((item) => ({ ...item, val: `Updated ${item.id}` }));
  const t3 = performance.now();
  const updateDuration = Math.max(0.01, t3 - t2);
  results.push({
    itemCount: count,
    operation: "update",
    durationMs: Number(updateDuration.toFixed(2)),
    opsPerSecond: Math.round((count / updateDuration) * 1000),
  });

  // 3. Reorder simulation (reverse order)
  const t4 = performance.now();
  items = [...items].reverse();
  const t5 = performance.now();
  const reorderDuration = Math.max(0.01, t5 - t4);
  results.push({
    itemCount: count,
    operation: "reorder",
    durationMs: Number(reorderDuration.toFixed(2)),
    opsPerSecond: Math.round((count / reorderDuration) * 1000),
  });

  // 4. Clear simulation
  const t6 = performance.now();
  items = [];
  const t7 = performance.now();
  const clearDuration = Math.max(0.01, t7 - t6);
  results.push({
    itemCount: count,
    operation: "clear",
    durationMs: Number(clearDuration.toFixed(2)),
    opsPerSecond: Math.round((count / clearDuration) * 1000),
  });

  return results;
}
