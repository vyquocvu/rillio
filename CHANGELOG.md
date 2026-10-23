# Changelog

All notable changes to ZUI are documented here.

## [Unreleased]

### Added
- Added `createPortal(children, container, key?)` primitive and `PORTAL_TYPE` component symbol in `zui/compat` and `zui`, allowing JSX subtrees to render into arbitrary external DOM target containers while preserving component hierarchy, context, reactive state, effects, and zero-leak unmount cleanup.
- Added `ErrorBoundary` primitive component in `zui/compat` and `zui`, providing declarative render error catching, fallback UI rendering (`fallback` prop as `Child` or `(error, reset) => Child`), `reset()` recovery, hierarchical boundary escalation, and `onError(error, { componentStack })` diagnostics.
- Added transaction savepoint support (`savepoint()` and `rollbackTo(savepoint)`) on `PatchTransaction`, enabling atomic sub-transaction rollback of failed child renders without discarding the parent boundary.
- Modularized `src/flat.ts` (~2,094 LOC) into 9 architectural modules under `src/flat/` (`types.ts`, `security.ts`, `properties.ts`, `dom.ts`, `focus.ts`, `registry.ts`, `transaction.ts`, `engine.ts`, `index.ts`), keeping `src/flat.ts` as a 100% backward-compatible re-export facade.
- Modularized `src/compat.ts` (~950 LOC) into 8 architectural modules under `src/compat/` (`types.ts`, `state.ts`, `hooks.ts`, `portal.ts`, `error-boundary.ts`, `reconcile.ts`, `root.ts`, `index.ts`), keeping `src/compat.ts` as a 100% backward-compatible re-export facade.
- Modularized `src/dom.ts` into 6 architectural modules under `src/dom/` (`types.ts`, `bindings.ts`, `control-flow.ts`, `mount.ts`, `resource.ts`, `index.ts`), keeping `src/dom.ts` as a 100% backward-compatible re-export facade.
- Added asynchronous resource primitive `resource()` and `createResource()` in `zui/dom` and `zui/reactive`, providing fine-grained `.loading`, `.data`, `.error`, and `.status` stores, optimistic `.mutate()`, manual `.refetch()`, race condition suppression, and seamless `<Show when={res.loading} fallback={...}>` integration without throw-Promise / VDOM-stack-breaking anti-patterns.
- Added `zui/devtools` subpath featuring `inspectRoot`, `inspectNode`, `trackTransactions`, `highlightNode`, and `createInspectorOverlay`, providing real-time in-browser inspection of the Addressable Flat Index (`NodeId`, `Kind`, `OwnerId`, `Version`, `Tombstones`, and active `PatchOp` transactions) with zero overhead on non-inspected nodes.
- Added TaskFlow real-world project management showcase (`examples/realworld/` and `/realworld.html`), demonstrating an end-to-end modern workspace with a 5-column Kanban board, sortable/filterable issues table, real-time analytics KPIs and priority charts, team capacity management, workspace settings with live `ErrorBoundary` transactional recovery, floating toast notifications and accessible modal dialogs via `createPortal`, centralized reactive state via `zui/external-store`, persistent async mock storage, and interactive Flat Index inspection HUD via `zui/devtools`.
- Added `onCommit` transaction telemetry observer and `ops` getter on `PatchEngine` and `PatchTransaction`.
- Added dedicated test suites for portals, error boundaries, Flat Index and reactive DOM submodules, resources, and devtools. Later coverage added the component lifecycle matrix and render diagnostics suites; browser Playwright integration exercises the TaskFlow workspace lifecycle.

### Changed
- Extracted the keyed-list LIS (`longestIncreasingSubsequencePositions`) and move planner (`planStationaryMoves`) into shared `src/flat/lis.ts`, and shallow equality into `src/flat/equality.ts` (`shallowEqual`). Public exports are preserved: `zui/compat` still re-exports the LIS and `zui/dom` keeps `longestIncreasingIds` as an adapter. `shallowEqual` ignores inherited enumerable properties and is used by the external-store adapter.

### Performance
- `PatchEngine.transaction` no longer snapshots the operation list unless commit listeners are attached.
- `PatchTransaction.commit` executes removals without allocating filtered operation copies, and `validate()` reuses pooled validation collections instead of allocating four per commit.
- `Resource.refetch()` and `Resource.mutate()` are fully untracked: calling them inside an effect no longer subscribes that effect to the source store or to resource internals.

### Fixed
- `PatchTransaction.commit` now consumes operations enqueued by ref callbacks during a commit that also contains removals (the previous filtered snapshot silently dropped them).
- `PatchEngine.transaction` and `PatchEngine.update` now isolate a failed nested callback on the same root behind a transaction savepoint. Operations enqueued and nodes created before the throw are rolled back, so a caller that catches the error can continue on the outer transaction; previously that work leaked into the outer commit and the created nodes stayed live in both the DOM and the registry. `ZUI_NESTED_ROOT_TRANSACTION` is still raised for a nested call against a different root.
- `PatchEngine.onCommit` telemetry now reports the committed operation list. The snapshot was taken before `commit()`, so operations appended by deferred ref callbacks during the commit were omitted and `opCount` under-reported what actually ran.
- Aligned the consumer fixture and the Playwright browser harness with the documented subpath split: `createStore` is imported from `zui/reactive`, while `zui/dom` and the deprecated `zui/legacy` alias are exercised through `mount`. Both still imported `createStore` from `zui/dom` after that export moved, so `npm run test:consumer` and `npm run test:browser` failed on a clean checkout.
- Removed the implicit shallow-equal component bailout. Parent updates now rerun matched descendants, allowing `ErrorBoundary` to catch errors raised during those renders; local state and external-store selector updates remain scoped to their owning components. The render-lab and browser smoke test now check render counts separately from DOM identity.
- Routed portal placement and target changes through validated `PatchTransaction` operations, with inverse moves when a later commit callback fails. A failed planning pass no longer moves a live portal before commit.
- Sealed transactions after an outer callback fails, preventing an escaped `PatchTransaction` from being reused, and journaled cleanup attachment changes so nested savepoint rollback restores cleanup state on existing nodes.

## [0.1.0] - 2026-10-13

### Added
- Refactored the production DOM runtime around a Flat Index with stable node, root, and owner ids (`NodeRegistry`).
- Routed JSX and explicit reactive rendering through one transactional `PatchEngine`.
- Published the `zui/flat` entry point for runtime authors.
- Released packaging configuration for ESM JavaScript and TypeScript declarations.
- Added a dependency-free `zui/zustand` hook for vanilla and bound Zustand stores, with selector equality and lifecycle-managed subscriptions.
- Expanded DOM contract for SVG namespaces (`createElementNS`), presentation attributes, and XML namespaces (`xlink:href`, `xml:space`).
- Added form properties (`selected`, `indeterminate`, `readOnly`, `required`, `multiple`, `autoFocus`, `formNoValidate`, `htmlFor`) and controlled input drift restoration.
- Added custom elements support with `is` attribute and direct property assignment.
- Normalized accessibility-oriented ARIA boolean/token values (`"true"`/`"false"`).
- Added accessible defaults, tokens, and primitives in `zui/ui`.
- Baseline typed HTML/SVG JSX props, tag-aware common event targets, and consumer checks for both JSX runtime type entry points.
- Best-effort commit rollback with inverse DOM operations and renderer hook snapshot restoration.
- Added security guards rejecting unsafe HTML sinks (`innerHTML`, `outerHTML`, `srcdoc`), executable URL schemes (`javascript:`, `vbscript:`, `data:text/html`), and string-valued inline event handlers before commit.
- Added `nodeRegistry.diagnostics()` reporting real-time counts for active/tombstoned nodes, owners, roots, and capacity bounds.
- Added `create`, `createStore`, `shallow`, and `useShallow` in `zui/zustand` for zero-dependency bound stores without React.
- Added canonical `zui/dom` subpath for the explicit reactive DOM API (`zui/legacy` deprecated as compatibility alias).
- Licensed under the MIT License.

### Removed
- Removed obsolete pre-Playwright `tests/browser-smoke.cjs`.

### Performance
- Zero-allocation transaction tracking in `PatchTransaction` via monotonic ID comparisons instead of `Set` allocations.
- Leaf primitive text fast-path in `mountValue`, directly attaching text children without `reconcileChildren` function frames.
- Zero-allocation `commitCreatedOnly` single-pass mount pipeline with direct `node.parentId !== null` duplicate checking and cycle pruning on leaf nodes.
- Multi-slot unrolled MRU locality caching in `NodeRegistry` (4-slot node cache, 2-slot owner cache) eliminating Map hash overhead on sequential traversals.
- Zero-DOM SVG namespace resolution via boolean `isSvg` flag on `FlatNode`, eliminating C++/V8 boundary crossings (`namespaceURI`).
- Streamlined `insertCreatedRange` and `linkCreatedChild` with direct `appendChild`/`insertBefore` and pruned ancestor checks for newly created nodes.
- Keyed reversal fast path (`reconcileReversedChildren`) with $O(N)$ permutation detection, bypassing LIS search.
- Single-pass `matchedRecords` caching in `reconcileOrderedChildren` eliminating duplicate second-pass registry lookups.
- Cached parent propagation through recursive JSX descent pre-populating node and parent references for transactions.
- Pure JavaScript text diffing against cached `node.value`, removing native Blink `CharacterData.data` DOM reads.
- Static closure-free array normalization (`flattenChild`) with raw indexed loops.
- Keyed reconciliation and explicit `For` using an LIS pass to minimize moves.
- Pre-resolved keyed move-batch records during validation to avoid repeated lookups.
- Inert initial attribute application to detached native nodes, attaching completed host subtrees once.
- Lazy listener and style allocation; stripped disposed records retaining a bounded tombstone pool.

### Verification
- 113 unit/regression/oracle tests across 11 test suites.
- Strict external consumer package verification (production and dev JSX, subpaths, expected compile failures).
- Playwright Chromium browser test suite verifying dashboard flows, modal keyboard/focus traps, and sink guards.
- Clean-checkout verification passing all release gates.
