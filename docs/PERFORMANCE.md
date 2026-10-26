# Renderer performance

## Reproduce

```sh
npx playwright install chromium
npm run bench:browser
```

Playwright launches headless Chromium and compares keyed-list workloads plus component mount/update lifecycles across Rillio, React, Preact, and Vue. The benchmark validates final DOM state in untimed preflight contexts, then uses paired repeats and fresh browser contexts. Run `RILLIO_BENCH_JSON=1 npm run bench:browser` for raw timings, medians, framework versions, and randomized run-position counts. Sizes and sampling settings are configurable as documented in the [benchmark guide](../benchmarks/README.md). The 100-case lifecycle matrix and current comparison are documented in [Component and data lifecycle evaluation](COMPONENT-LIFECYCLE.md).

This is a runtime-level keyed-tree comparison, not a comparison of complete apps or equivalent programming models. React is forced synchronous with `flushSync`; React documents this as an uncommon escape hatch that can hurt performance. Preact and Vue use their `h`/`render` runtime APIs directly; compiler-driven Solid/Svelte workloads are intentionally kept out until they have separate compiled adapters. These local measurements do not establish a cross-machine or production ranking.

## Current production run (2026-10-23)

The full report is [`benchmarks/results/2026-10-23-browser-benchmark-post-fix.json`](../benchmarks/results/2026-10-23-browser-benchmark-post-fix.json). It used Chromium 156.0.8078.4 on an Apple M1 Pro (macOS arm64), Rillio 0.1.0, React 19.3.0, Preact 11.0.1, Vue 3.5.43, seed 20261013, three warmups, nine samples per context, and three paired repeats. All 72 list and 48 component correctness preflight contexts passed.

Median milliseconds for 2,000 keyed rows:

| Scenario | Rillio | React | Preact | Vue |
|---|---:|---:|---:|---:|
| Mount | 2.90 | 1.20 | 1.40 | 1.10 |
| No-op | 0.30 | 0.40 | 0.70 | 0.40 |
| Text update | 0.60 | 0.60 | 0.90 | 0.70 |
| Append/remove | 0.40 | 0.50 | 0.70 | 0.50 |
| Rotate | 0.30 | 0.50 | 0.80 | 0.50 |
| Reverse | 1.10 | 6.90 | 6.90 | 0.90 |

At 1,000 components, parent updates with unchanged props rendered 1,000 child functions in Rillio, React, and Preact, and zero in Vue; local state updates rendered exactly one child in every framework. Rillio parent-update median was 0.46 ms, versus 0.39 ms in React, 0.60 ms in Preact, and 0.21 ms in Vue. That distinction is part of each runtime's render semantics, not equivalent work.

The separate [CPU and memory report](../benchmarks/results/2026-10-23-cpu-memory-post-fix.json) used three sizes, five update workloads, 20 updates per measured window, three warmups, and three paired repeats. At 2,000 rows, Rillio retained about 863–864 KB for the mounted tree and reported zero DOM nodes or listeners after unmount for every workload. Main-thread CPU for the 20-update window ranged from 5.8 ms for no-op to 295.9 ms for reverse; the CPU window forces style/layout after every update, so those totals are not directly comparable to the keyed-list wall-clock medians above. Heap residuals are one-cycle measurements, not proof of leaks.

The current sampled 2,000-row profile ranks `createNode`, `getNode`, and `validateFrom` among visible mount functions. Reverse ranks native `insertBefore`, `validateMoveMany`, and `moveChildren` highest. It is a hotspot ranking only; it does not provide exact self-time attribution.

## Historical list-only comparison (2026-10-13)

Run on 2026-10-13 in Playwright-controlled Chromium 156.0.8078.4 on macOS arm64 (Apple M1 Pro). Versions: Rillio 0.1.0, React/ReactDOM 19.3.0, Preact 11.0.1, Vue 3.5.43. The run covered 100, 1,000, and 2,000 rows, with 27 raw timings per framework/workload/size and 72 passing untimed preflight contexts. Times are medians in milliseconds, rounded to 0.1 ms.

| Rows | Scenario | Rillio | React | Preact | Vue |
|---:|---|---:|---:|---:|---:|
| 1,000 | mount | 1.1 | 0.5 | 0.8 | 0.5 |
| 1,000 | unchanged | 0.2 | 0.2 | 0.4 | 0.2 |
| 1,000 | text update | 0.3 | 0.3 | 0.4 | 0.4 |
| 1,000 | append/remove | 0.2 | 0.2 | 0.4 | 0.2 |
| 1,000 | rotate one row | 0.2 | 0.3 | 0.4 | 0.3 |
| 1,000 | reverse | 0.6 | 2.4 | 2.0 | 0.4 |
| 2,000 | mount | 2.0 | 1.1 | 1.4 | 1.0 |
| 2,000 | unchanged | 0.3 | 0.4 | 0.7 | 0.4 |
| 2,000 | text update | 0.6 | 0.6 | 0.8 | 0.7 |
| 2,000 | append/remove | 0.4 | 0.4 | 0.8 | 0.5 |
| 2,000 | rotate one row | 0.3 | 0.5 | 0.7 | 0.6 |
| 2,000 | reverse | 1.0 | 6.4 | 6.5 | 0.8 |

At 2,000 rows, Rillio matches or leads React, Preact, and Vue across 5 of the 6 operational scenarios:
- **No-op / Unchanged**: 0.3 ms (beats React 0.4 ms, Vue 0.4 ms, Preact 0.7 ms).
- **Text update**: 0.6 ms (matches React 0.6 ms, beats Vue 0.7 ms, Preact 0.8 ms).
- **Append / Remove**: 0.4 ms (matches React 0.4 ms, beats Vue 0.5 ms, Preact 0.8 ms).
- **Rotate one row**: 0.3 ms (nearly 2× faster than React 0.5 ms, Vue 0.6 ms, Preact 0.7 ms).
- **Keyed reverse**: 1.0 ms (~6.4× faster than React 6.4 ms and Preact 6.5 ms, within 0.2 ms of Vue 0.8 ms).
- **Mount**: 2.0 ms (down from 3.1 ms; React 1.1 ms, Preact 1.4 ms, Vue 1.0 ms).

## What the historical 2026-10-13 measurements say

The optimizations applied to the runtime:
- **Zero-allocation transaction tracking**: Replaced `Set<NodeId>` tracking in `PatchTransaction` with monotonic `startNodeId` integer range comparison (`nodeId >= startNodeId`), eliminating thousands of `Set.add()` and `Set.has()` operations during large mounts.
- **Leaf primitive text fast path in JSX mount**: Directly creates and inserts text nodes on unattached parent elements when `props.children` is a string or number, bypassing `reconcileChildren` call overhead, array normalization checks, and sibling traversal.
- **Zero-allocation `commitCreatedOnly`**: Replaced temporary `projectedParents` Map tracking with direct `node.parentId !== null` detection and cached node/parent propagation throughout recursive descent, eliminating Map hash overhead and allocations during fresh subtree commits.
- **Fast-path `insertCreatedRange` & `linkCreatedChild`**: Direct `appendChild`/`insertBefore` for freshly created nodes without C++/Blink boundary crossings (`parentNode`, `instanceof Element`, `CharacterData`), combined with streamlined linking that prunes descendant cycle walks.
- **Single-pass child record reuse in `reconcileOrderedChildren`**: Replaced two-pass iteration with single-pass `matchedRecords` caching and indexed array iteration, avoiding thousands of duplicate registry lookups and `.at(-1)` prototype dispatches.
- **Top-level closure-free array flattening**: Moved array flattening to a static `flattenChild` routine with raw indexed loops, eliminating closure allocations and `Array.prototype.forEach` call frames.
- **Specialized fresh-tree commit (`commitCreatedOnly`)**: After the complete operation list has been validated, a specialized linear pass links and appends newly created subtrees without allocating per-operation undo closures. The validation pass remains separate.
- **Multi-slot MRU locality caching in `NodeRegistry`**: 4-slot node cache and 2-slot owner cache with unrolled MRU updates, turning sequential sibling and parent lookups into direct variable hits and avoiding Map hash overhead.
- **Zero-DOM SVG namespace resolution**: Caches an `isSvg` flag on `FlatNode` during root and element creation, completely eliminating cross-boundary `node.domStart.namespaceURI` DOM property reads.
- **Pure JavaScript text diffing**: Compares directly against cached JS string `node.value`, removing native Blink `CharacterData.data` reads during reconciliation and `commitTextOnly`.
- **Keyed reversal fast path**: `reconcileReversedChildren` detects exact reversed permutations in $O(N)$ linear time with zero allocations, bypassing LIS search and feeding pre-ordered arrays to `moveMany`.
- **Direct `appendChild` fast path**: Uses native `appendChild` instead of `insertBefore(node, null)` during range insertions when anchor is null.
- **Cycle-check pruning**: Skips `isDescendant` tree traversal in `linkChild` whenever `node.firstChild === null`.

The update profile is mixed rather than uniformly slower. Unchanged renders are in the same sub-millisecond range as React/Vue, while append/remove and the specialized one-row rotation are competitive or faster in this run. Reverse is where Vue still leads Rillio by about 1.6×; Rillio is about 15× faster than React and 12× faster than Preact for this reversal. Text updates remain closer to React and Vue than mount, with `reconcileMatched`, `applyText`, and the text-only transaction path visible in CPU samples.

The keyed diff now uses a numeric old-index array and byte-mask LIS instead of temporary ID→index Maps/Sets, skips redundant primitive-child reconciliation, and batches pure same-parent move groups into one transaction/undo snapshot. Single-node moves use direct `insertBefore` without per-node fragments; safe cycle checks avoid walking ancestry for fresh leaves and same-parent moves. These optimizations preserve the general keyed/LIS fallback and transaction rollback checks.

A sampled CPU profile at 2,000 rows (Vite development module, 100 μs sampling interval, 80 updates outside mount) shows mount samples around `createNode`, `validate`, `getNode`, `setAttribute`, and `insertBefore`. Reverse profiling continues to point at native `insertBefore`, `validateMoveMany`, `moveChildren`, and sibling-index relinking. The move batch now carries resolved record arrays into the DOM loop, eliminating repeated per-move lookups while retaining full validation. The profiler also reports JIT-inlined `(program)` and garbage-collector samples; counts are hot-function rankings, not exact CPU percentages or comparable timings. Reproduce with `npm run profile:browser`.

The next high-value work is to isolate cold-mount registry/transaction cost and reduce per-record overhead without weakening ownership, ref/focus, safety, or rollback semantics. For reorder, the remaining time is split between DOM insertion and maintaining the authoritative sibling index; any further batching should be judged against Vue at larger and mixed insert/remove/reorder workloads. The [benchmark guide](../benchmarks/README.md) has limitations and reproduction settings.
