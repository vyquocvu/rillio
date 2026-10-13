# ZUI Status — Flat Index / UI library work

Updated: 2026-10-13. The verified workspace is uncommitted; `3cc18e3` is the base `HEAD`, not a revision containing the changes below. Record the resulting commit after review/commit.

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

## Verification

Environment: macOS arm64; Node v26.5.0; npm 12.0.2; TypeScript 5.9.3; Vitest 5.0.3; Vite 6.4.4; headless Chromium 156.0.8078.4.

- `npm run typecheck`: **PASS**
- `npm test`: **PASS — 10 files, 91 tests**
- `npm run build:release`: **PASS — Vite showcase/admin/demos (3 HTML entries) and package declarations**
- `npm run test:smoke`: **PASS — 16/16**
- `npm run test:oracle`: **PASS — 2,400 updates**
- `npm run bench:all`: **PASS — reactive, compatibility/keyed, and flat-index suites**
- `npm run test:consumer`: **PASS — strict external package; production/dev JSX, UI, reactive subpaths; expected type failures**
- `npm pack --dry-run`: **PASS — 47 publishable files, 68.2 kB tarball estimate**
- `npm run test:browser`: **PASS — dashboard flows, Modal keyboard/focus, root isolation, sink guards, and accessibility checks**
- `npm run bench:browser`: **PASS — 36 framework/scenario/size groups; three paired repeats, three warmups and nine samples per fresh context; balanced framework order; 36-context untimed DOM preflight**
- `npm run profile:browser`: **PASS — Playwright CPU sample ranking for mount/text/no-op; diagnostic only, not timing data**
- React/Preact behavioral parity: **NOT CLAIMED**

The latest browser medians and methodology are in [PERFORMANCE.md](PERFORMANCE.md). At 2,000 rows ZUI is near React on unchanged/append/rotation updates, remains slower on mount and text changes, and is faster on reversal in this workload. An extended 5,000-row run shows near-parity on unchanged/append/rotation, with mount and text update still the clearest optimization targets. These are local diagnostics, not a general ranking.

## Remaining release gaps

- The DOM runtime still needs broader SVG namespace/property normalization, custom-element semantics, and form/accessibility prop coverage. JSX typings are a checked baseline, not complete DOM declarations.
- Transaction rollback cannot undo arbitrary ref callbacks or cleanup side effects; clean-checkout release verification and a commit SHA remain outstanding.
- Heap profiling and live owner/effect diagnostics are not yet implemented; the tombstone cap only bounds retained diagnostics.
- Cold mount and text-only updates remain slower than React in the current browser workload; unchanged renders are near parity. See [the performance notes](PERFORMANCE.md).
- A license choice is still needed before publishing. CI/CD remains intentionally unconfigured per the repository's existing policy.
- SSR/hydration, portals, async resources, compiler optimization, devtools, and router/data-layer integrations remain out of scope.

See [the roadmap](../ROADMAP.md), [architecture](ARCHITECTURE.md), [API contract](API.md), and [testing plan](TESTING.md).
