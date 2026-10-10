# ZUI Release Roadmap

ZUI is moving from a prototype toward a small, dependable frontend runtime. The first public release targets a deliberately narrow API: JSX, function components, basic hooks, direct DOM reconciliation, and a separately maintained legacy reactive runtime.

## Release policy

- Release target: `v0.1.0`.
- Stability target: reliable for small browser applications, not React/Preact drop-in compatibility.
- Compatibility claims: only APIs covered by the release test matrix are supported.
- Breaking changes: allowed before `v1.0.0`, but must be documented in the changelog and migration notes.
- Legacy runtime: remains available at `zui/legacy`; it is not silently mixed with the default runtime.

## v0.1 scope

### Included

- JSX runtime with `jsx`, `jsxs`, `jsxDEV`, and `Fragment`.
- Function components returning elements, text, arrays, fragments, or null.
- `createRoot`, root rendering, and unmounting.
- `useState`, `useEffect`, `useMemo`, `useCallback`, and `useRef`.
- Keyed reconciliation with DOM identity preservation.
- Basic intrinsic attributes, events, refs, styles, and controlled form properties.
- Built ESM JavaScript and TypeScript declarations.
- Legacy store-first runtime under `zui/legacy`.

### Explicitly excluded

- Context, `useReducer`, `useLayoutEffect`, `memo`, and `forwardRef`.
- Synthetic events and React scheduling/batching parity.
- Concurrent rendering, Suspense, portals, SSR, and hydration.
- Full SVG/property normalization and broad React ecosystem compatibility.

## Work plan

### R0 — Baseline and scope freeze

- [ ] Record the exact starting commit, supported Node/browser versions, and package manager.
- [ ] Run typecheck, unit tests, smoke tests, oracle tests, and production build.
- [ ] Convert every known failure into a tracked issue or an explicit limitation.
- [ ] Add a changelog and define the public export surface.

### R1 — Runtime correctness

- [ ] Make repeated `render()` calls update the existing root instead of remounting it.
- [ ] Validate hook ordering and fail clearly on render-phase state writes.
- [ ] Define effect ordering, cleanup errors, re-entrant updates, and batching behavior.
- [ ] Roll back partially mounted DOM and subscriptions when rendering throws.
- [ ] Verify root, component, keyed child, and effect disposal under repeated mount/unmount.

### R2 — DOM and interaction contract

- [ ] Test insert, remove, reorder, replacement, duplicate keys, and nested keyed components.
- [ ] Test event replacement/removal, refs, class/style diffing, attributes, and boolean properties.
- [ ] Test controlled `value`, `checked`, focus, caret, and selection behavior.
- [ ] Define and test the supported native event name mapping.
- [ ] Either implement the scoped SVG behavior or document SVG as unsupported in the release contract.

### R3 — Package and developer experience

- [ ] Build distributable ESM JavaScript and `.d.ts` files.
- [ ] Replace source-TS package exports with the generated release artifacts.
- [ ] Add a lockfile and a clean-install verification path.
- [ ] Add a strict external consumer fixture using JSX and the published package shape.
- [ ] Document installation, supported APIs, migration from legacy imports, and known limitations.

### R4 — Release verification

- [ ] Run all checks from a clean checkout on the release commit.
- [ ] Exercise Counter and Todo browser flows without console errors.
- [ ] Run lifecycle stress tests for 100 repeated mount/unmount cycles.
- [ ] Verify no active computations, listeners, or DOM regions remain after disposal.
- [ ] Record results, environment, and commit SHA in `docs/STATUS.md`.
- [ ] Tag `v0.1.0-rc.1`, fix release blockers, then tag `v0.1.0`.

## Release gates

The release is blocked until all gates pass on the same commit:

| Gate | Requirement |
|---|---|
| API | Public exports and documented limitations match the implementation |
| Correctness | Typecheck, unit tests, smoke tests, and oracle tests pass |
| DOM | Keyed identity, props, events, refs, forms, and unmount behavior pass |
| Lifecycle | Repeated mount/unmount leaves no retained effects, listeners, or DOM |
| Browser | Counter and Todo workflows pass in supported browsers |
| Package | Clean external consumer imports built JS and declarations successfully |
| Docs | README, API docs, migration notes, changelog, and status evidence are current |

## Post-v0.1 backlog

- `v0.2`: context, reducer, improved scheduling, memoization, and broader form support.
- `v0.3`: SVG parity, stronger JSX types, accessibility-oriented DOM properties, and performance profiling.
- `v1.0`: only after a compatibility contract, semver process, consumer suite, and long-term maintenance policy are established.

## Definition of done

ZUI is no longer treated as a prototype when `v0.1.0` passes every release gate, ships generated artifacts, has a reproducible clean-install workflow, and publishes evidence for the exact release commit. Until then, documentation must distinguish implemented behavior from verified behavior.
