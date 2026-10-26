const { performance } = require("node:perf_hooks");

async function main() {
  const { createEngine } = await import("../.rillio-test/reactive.js");

  function benchmark(mode, subscriptions, iterations = 200) {
    const engine = createEngine(mode);
    const source = engine.createStore(0);
    const unrelated = Array.from(
      { length: subscriptions },
      (_, index) => engine.createStore(index)
    );
    let observations = 0;
    engine.effect(() => {
      source.get();
      observations++;
    });
    unrelated.forEach(store => {
      engine.effect(() => { void store.get(); });
    });

    for (let iteration = 0; iteration < 10; iteration++) source.set(iteration + 1);
    const before = engine.diagnostics();
    const started = performance.now();
    for (let iteration = 0; iteration < iterations; iteration++) source.set(iteration + 11);
    const elapsed = performance.now() - started;
    const after = engine.diagnostics();

    return {
      mode,
      subscriptions,
      iterations,
      averageMs: elapsed / iterations,
      observations,
      visited: after.visitedComputations - before.visitedComputations,
      evaluations: after.selectorEvaluations - before.selectorEvaluations
    };
  }

  for (const subscriptions of [100, 1_000, 10_000]) {
    const scan = benchmark("scan", subscriptions);
    const graph = benchmark("graph", subscriptions);
    console.log(JSON.stringify({
      subscriptions,
      scan,
      graph,
      speedup: scan.averageMs / graph.averageMs
    }));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
