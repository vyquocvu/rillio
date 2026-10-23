# Performance follow-up experiments

These experiments stay outside the production PatchEngine until their reference
models pass the full transaction oracle and measurements repeat across browsers.

## Incremental transaction validation

- Compare the current full validator with a prototype that tracks touched nodes,
  projected parents, and removals by transaction version.
- Include text-only updates, localized sibling moves, nested savepoints, mixed
  insert/move/remove batches, and invalid suffixes appended by refs.
- Require identical accept/reject outcomes and error codes before comparing
  validation time and allocated scratch state. Report results by operation and
  tree size; do not cache across a savepoint rollback unless its version key
  proves the projection is unchanged.

## Versioned reactive scheduling

- Record computation evaluations and generated patch counts per update cycle
  for scan and graph modes before adding generation counters.
- Exercise diamonds, repeated writes in a batch, conditional dependencies,
  re-entrant effects, and disposed computations.
- Accept a prototype only if it preserves settled computed values and effect
  ordering while reducing repeated evaluations across several workloads. Keep
  the public store API unchanged.

## Cost-aware planner

- `npm run bench:patch-planning` runs deterministic workloads against the
  caller-provided DOM host, checks final order, calibrates operation weights,
  and prints planner time separately from DOM application time.
- The checked-in command uses jsdom. For browser claims, call
  `runPatchPlanningBenchmark(document)` from a real browser and compare held-out
  workloads across Chromium, Firefox, and WebKit before considering production
  adoption.
- Calibrated weights are specific to the runtime, browser, and workload. Never
  check in a universal weight vector or infer browser cost from move count alone.
