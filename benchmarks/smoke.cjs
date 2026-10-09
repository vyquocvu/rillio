/**
 * Exploratory microbenchmark only.
 * Not the preregistered confirmatory experiment: no independent runs,
 * balanced ordering, confidence intervals, heap, or JIT/GC controls yet.
 */
const { performance } = require("node:perf_hooks");
const { createEngine } = require("../.zui-test/reactive.js");

function benchmark(mode, subscriptions, affectedPct, iterations = 80) {
  const engine = createEngine(mode);
  const stores = Array.from(
    { length: subscriptions }, () => engine.createStore(0)
  );
  let observations = 0;
  stores.forEach(store => {
    engine.effect(() => { void store.get(); observations++; });
  });
  const changed = Math.max(1, Math.round(subscriptions * affectedPct / 100));
  let elapsed = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    engine.batch(() => {
      for (let j = 0; j < changed; j++) stores[j].set(i + 1);
    });
    elapsed += performance.now() - start;
  }
  return {
    averageMs: elapsed / iterations,
    observations,
    diagnostics: engine.diagnostics()
  };
}

for (const subscriptions of [100, 1_000, 10_000]) {
  for (const affectedPct of [0.1, 1, 10]) {
    const scan = benchmark("scan", subscriptions, affectedPct);
    const graph = benchmark("graph", subscriptions, affectedPct);
    console.log(JSON.stringify({
      subscriptions, affectedPct,
      scanMeanMs: scan.averageMs,
      graphMeanMs: graph.averageMs,
      ratio: scan.averageMs / graph.averageMs,
      scanVisits: scan.diagnostics.visitedComputations,
      graphVisits: graph.diagnostics.visitedComputations
    }));
  }
}
