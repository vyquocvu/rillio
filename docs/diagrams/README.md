# Rillio diagrams

These diagrams describe the current checkout for repo contributors. Each standalone HTML file is interactive; its adjacent JSON file is the editable Archify source.

## Runtime and updates

- [Runtime architecture](architecture.html) · [source](architecture.json) — public JSX, explicit DOM, reactive, and external-store surfaces flowing through their planners to the shared Flat Index, transaction, patch engine, and browser DOM.
- [Reactive data flow](reactive-dataflow.html) · [source](reactive-dataflow.json) — state writes and selectors triggering component planning or DOM effects, then addressable operations and DOM commits.
- [Transaction workflow](transaction-workflow.html) · [source](transaction-workflow.json) — validation, portal range placement, commit/finalization telemetry, savepoint rollback, outer transaction sealing, and cross-root rejection.
- [Node and owner lifecycle](node-owner-lifecycle.html) · [source](node-owner-lifecycle.json) — allocation through disposal, stable identity during updates and moves, iterative subtree cleanup, and bounded diagnostic tombstones.

## Performance research

- [Performance research flows](performance-research.html) · [source](performance-research.json) — Chromium CPU and memory measurements alongside the separate experimental patch-planning comparison.

The Chromium flow measures production bundles and writes per-run evidence. The planner comparison is an isolated research harness; it checks candidate plans in jsdom and does not describe production `PatchEngine` behavior. Treat its local measurements as exploratory, not as general performance claims.

The `*.visual-check.json` sidecars record automated browser results. Perceptual screenshot review is recorded separately in [VISUAL-REVIEW.md](VISUAL-REVIEW.md).
