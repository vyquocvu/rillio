# ZUI Status — Flat Index / UI library work

Updated: 2026-10-23. Verification below was run on the working tree based on `1eaf640` with the uncommitted changes present. The earlier v0.1.0 baseline is superseded and remains in git history.

## Implemented

- `NodeRegistry` assigns stable node/root/owner ids and tracks linked DOM structure, ownership, and versions.
- JSX and explicit reactive rendering share one `PatchEngine`; overlapping roots are rejected instead of silently orphaning a live tree.
- Disposed records release DOM/component references and retain only a bounded set of lightweight tombstones (default 1,000).
- Failed renderer updates restore hook snapshots and attempt inverse DOM/property operations. User callbacks and cleanup side effects remain best-effort, not atomic.
- Keyed reconciliation and explicit `For` use an LIS pass to avoid unnecessary moves; no-op range moves are skipped.
- HTML parsing sinks, executable URL schemes, and string-valued inline event props are rejected before commit.
- The optional `zui/ui` layer includes composable primitives, a responsive admin showcase, modal focus handling, and Input/Progress accessibility defaults.
- Production and development JSX entry points have baseline typed HTML/SVG attributes, common typed event targets, and consumer fixtures that assert invalid attributes fail compilation.
- ESM/declaration exports and strict external consumer tests cover package subpaths and both JSX modes.
- The DOM contract covers SVG namespaces (`createElementNS`), presentation attributes, XML namespaces (`xlink:href`, `xml:space`), form properties and controlled input drift restoration, customized built-in elements, and accessibility-oriented ARIA normalization.
- `nodeRegistry.diagnostics()` reports real-time diagnostic counts of active/tombstoned nodes, owners, and roots to verify memory boundedness and leak prevention.
- First-class, zero-dependency external store integration in `zui/external-store` with `create`, `createStore`, `useStore`, `shallow`, and `useShallow` (Zustand-compatible API).
- Canonical `zui/dom` subpath established for the explicit reactive DOM API, retaining `zui/legacy` as a deprecated compatibility alias.
- Post-release additions include `createPortal`, `ErrorBoundary`, asynchronous resources, the `zui/devtools` inspector, and the TaskFlow application showcase.
- Parent updates rerun every matched component descendant. Component-local state and external-store selector updates remain scoped to the component that owns the state or selected slice.
- Portal mount and target changes are queued as transaction operations and applied through `PatchEngine`; a later commit failure restores an existing portal range.
- Same-root nested transaction callbacks join behind savepoints. Failed callbacks discard queued work and created nodes and restore cleanup attachments; an outer callback failure seals the transaction against reuse.

## Verification run — 2026-10-23

Environment: macOS arm64 (Apple M1 Pro); Node v26.5.0; npm 12.0.2; TypeScript 5.9.3; Vitest 5.0.3; Vite 6.4.4; Playwright 1.64.0; headless Chromium 156.0.8078.4.

- `npm run typecheck`: **PASS**
- `npm test`: **PASS — 23 files, 290 tests**
- `npm run build:release`: **PASS — Vite showcase/admin/demos entries and package declarations**
- `npm run test:smoke`: **PASS — 16/16**
- `npm run test:oracle`: **PASS — 2,400 updates**
- `npm run test:consumer`: **PASS — strict external package; production/dev JSX, UI, reactive, dom and legacy subpaths; expected type failures**
- `npm pack --dry-run`: **PASS — 203 files, 3.31 MB tarball, 7.10 MB unpacked, including package declarations and current docs**
- `npm run test:browser`: **PASS — dashboard, render scopes, store selectors, keyed data, async resources, UI primitives, DevTools, and TaskFlow ErrorBoundary recovery**
- `npm run bench:all`: **PASS — reactive scan/graph, compatibility render, flat-index, and keyed reorder workloads**
- `npm run bench:patch-planning`: **PASS — 20 planner/workload combinations at 128 nodes, 25 iterations each**
- `npm run bench:browser`: **PASS — production comparison across ZUI/React/Preact/Vue; `suite=all`, 3 warmups, 9 samples per context, 3 paired repeats; 72 list + 48 component correctness preflights and 360 measured fresh contexts. Raw report: [browser benchmark](../benchmarks/results/2026-10-23-browser-benchmark-post-fix.json).**
- `npm run bench:cpu-memory`: **PASS — 60 correctness preflights and 180 measured runs; default sizes, workloads, warmup, and repeats. Raw report: [CPU and memory benchmark](../benchmarks/results/2026-10-23-cpu-memory-post-fix.json).**
- `npm run profile:browser`: **PASS — sampled mount, text, no-op, and reverse profiles at 2,000 rows; diagnostic only, not timing data**
- React/Preact behavioral parity: **NOT CLAIMED**

The browser medians and methodology are in [PERFORMANCE.md](PERFORMANCE.md). They are local diagnostics, not a general ranking. The transaction workflow diagram was regenerated from its JSON source and passed 9/9 showcase checks plus automated containment at 1440×900, 1600×1000, 1920×1080, and 2048×1320; light and dark screenshots passed at 1440×900 and 2048×1320.

## Known limitations and future work

- Parent-driven component rendering visits every matched descendant. This preserves render/error-boundary semantics but makes large parent updates more expensive; keep high-frequency state close to its owner or subscribe at the leaf.
- Transaction rollback cannot undo arbitrary ref callbacks or cleanup side effects; cleanup failures may occur after commit. Savepoints restore cleanup attachment state, while effects already performed by user callbacks remain best-effort.
- Deep V8 heap allocation profiling snapshots remain future work. The `zui/devtools` package provides live Flat Index inspection and transaction telemetry.
- Cold mount remains slower than React and Vue in the current local comparison. See [the performance notes](PERFORMANCE.md) for measurements and limitations.
- CI/CD remains intentionally unconfigured per the repository's existing policy. Because gates are run by hand, a commit can land with a red gate; the two harness breakages fixed alongside this run (`createStore` moving to `zui/reactive` without updating the consumer fixture or the Playwright smoke harness) both reached `main` that way.
- SSR/hydration/streaming, Suspense, server components, an ahead-of-time compiler, and router/data-layer integrations remain out of scope.
- React/Preact behavioral, scheduling, synthetic-event, and ecosystem compatibility are not promised.

See [the roadmap](../ROADMAP.md), [architecture](ARCHITECTURE.md), [API contract](API.md), and [testing plan](TESTING.md).
