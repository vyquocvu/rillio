# ZUI Status — Flat Index / UI library work

Updated: 2026-10-21. The v0.1.0 clean-checkout verification record is for `ba338f8`. The source snapshot reviewed includes post-release work recorded under `[Unreleased]` in the changelog.

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
- Expand the DOM contract for SVG namespaces (`createElementNS`), presentation attributes, and XML namespaces (`xlink:href`, `xml:space`); form properties (`selected`, `indeterminate`, `readOnly`, `required`, `multiple`, `autoFocus`, `formNoValidate`, `htmlFor`) and controlled input drift restoration; custom elements with `is` attribute and property assignment; and accessibility-oriented ARIA boolean/token normalization.
- `nodeRegistry.diagnostics()` reports real-time diagnostic counts of active/tombstoned nodes, owners, and roots to verify memory boundedness and leak prevention.
- First-class, zero-dependency external store integration in `zui/external-store` with `create`, `createStore`, `useStore`, `shallow`, and `useShallow` (Zustand-compatible API).
- Canonical `zui/dom` subpath established for the explicit reactive DOM API, retaining `zui/legacy` as a deprecated compatibility alias.
- Post-release additions include `createPortal`, `ErrorBoundary`, asynchronous resources, the `zui/devtools` inspector, and the TaskFlow application showcase.
- The JSX runtime skips child reconciliation when a parent update supplies shallow-equal child props.

## v0.1.0 release verification

The results below are the recorded clean-checkout release baseline at `ba338f8`; they are not a new verification run for this documentation update.

Environment: macOS arm64; Node v26.5.0; npm 12.0.2; TypeScript 5.9.3; Vitest 5.0.3; Vite 6.4.4; headless Chromium 156.0.8078.4.

- `npm run typecheck`: **PASS**
- `npm test`: **PASS — 11 files, 113 tests**
- `npm run build:release`: **PASS — Vite showcase/admin/demos (3 HTML entries) and package declarations**
- `npm run test:smoke`: **PASS — 16/16**
- `npm run test:oracle`: **PASS — 2,400 updates**
- `npm run bench:all`: **PASS — reactive, compatibility/keyed, and flat-index suites**
- `npm run test:consumer`: **PASS — strict external package; production/dev JSX, UI, reactive subpaths; expected type failures**
- `npm pack --dry-run`: **PASS — 52 publishable files, 81.7 kB tarball estimate**
- `npm run test:browser`: **PASS — dashboard flows, Modal keyboard/focus, root isolation, sink guards, and accessibility checks**
- `npm run bench:browser`: **PASS — 36 framework/scenario/size groups; three paired repeats, three warmups and nine samples per fresh context; balanced framework order; 36-context untimed DOM preflight**
- `npm run profile:browser`: **PASS — Playwright CPU sample ranking for mount/text/no-op; diagnostic only, not timing data**
- React/Preact behavioral parity: **NOT CLAIMED**

The unreleased feature work and its added test coverage are listed in [`CHANGELOG.md`](../CHANGELOG.md). The recorded 113-test count above applies to the v0.1.0 release baseline.

The browser medians and methodology are in [PERFORMANCE.md](PERFORMANCE.md). They are local diagnostics, not a general ranking.

## Known limitations and future work

- Transaction rollback cannot undo arbitrary ref callbacks or cleanup side effects; cleanup failures may occur after commit.
- Deep V8 heap allocation profiling snapshots remain future work. The `zui/devtools` package provides live Flat Index inspection and transaction telemetry.
- Cold mount remains slower than React and Vue in the recorded local comparison. See [the performance notes](PERFORMANCE.md) for measurements and limitations.
- CI/CD remains intentionally unconfigured per the repository's existing policy.
- SSR/hydration/streaming, Suspense, server components, an ahead-of-time compiler, and router/data-layer integrations remain out of scope.
- React/Preact behavioral, scheduling, synthetic-event, and ecosystem compatibility are not promised.

See [the roadmap](../ROADMAP.md), [architecture](ARCHITECTURE.md), [API contract](API.md), and [testing plan](TESTING.md).
