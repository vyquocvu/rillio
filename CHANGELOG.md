# Changelog

All notable changes to ZUI are documented here.

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
- Licensed under the MIT License.

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
- 109 unit/regression/oracle tests across 11 test suites.
- Strict external consumer package verification (production and dev JSX, subpaths, expected compile failures).
- Playwright Chromium browser test suite verifying dashboard flows, modal keyboard/focus traps, and sink guards.
- Clean-checkout verification passing all release gates.
