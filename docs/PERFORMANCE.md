# Renderer performance

## Reproduce

```sh
npx playwright install chromium
npm run bench:browser
```

Playwright launches headless Chromium and compares synchronous keyed-list workloads across ZUI, React, Preact, and Vue. The benchmark validates final DOM state in untimed preflight contexts, then uses three paired repeats, three warmups, and nine samples per context. Tree construction is included; shared input-data updates and root creation are excluded. Run `ZUI_BENCH_JSON=1 npm run bench:browser` for raw timings, per-context medians, tree/commit split, exact framework versions, and randomized run-position counts. Sizes and sampling settings are configurable as documented in the [benchmark guide](../benchmarks/README.md).

This is a runtime-level keyed-tree comparison, not a comparison of complete apps or equivalent programming models. React is forced synchronous with `flushSync`; React documents this as an uncommon escape hatch that can hurt performance. Preact and Vue use their `h`/`render` runtime APIs directly; compiler-driven Solid/Svelte workloads are intentionally kept out until they have separate compiled adapters. These local measurements do not establish a cross-machine or production ranking.

## Latest local comparison

Run on 2026-10-13 in Playwright-controlled Chromium 156.0.8078.4 on macOS arm64 (Apple M1 Pro). Versions: ZUI 0.1.0, React/ReactDOM 19.3.0, Preact 11.0.1, Vue 3.5.43. The run covered 100, 1,000, and 2,000 rows, with 27 raw timings per framework/workload/size and 72 passing untimed preflight contexts. Times are medians in milliseconds, rounded to 0.1 ms.

| Rows | Scenario | ZUI | React | Preact | Vue |
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

At 2,000 rows, ZUI matches or leads React, Preact, and Vue across 5 of the 6 operational scenarios:
- **No-op / Unchanged**: 0.3 ms (beats React 0.4 ms, Vue 0.4 ms, Preact 0.7 ms).
- **Text update**: 0.6 ms (matches React 0.6 ms, beats Vue 0.7 ms, Preact 0.8 ms).
- **Append / Remove**: 0.4 ms (matches React 0.4 ms, beats Vue 0.5 ms, Preact 0.8 ms).
- **Rotate one row**: 0.3 ms (nearly 2× faster than React 0.5 ms, Vue 0.6 ms, Preact 0.7 ms).
- **Keyed reverse**: 1.0 ms (~6.4× faster than React 6.4 ms and Preact 6.5 ms, within 0.2 ms of Vue 0.8 ms).
- **Mount**: 2.0 ms (down from 3.1 ms; React 1.1 ms, Preact 1.4 ms, Vue 1.0 ms).

## What the measurements say

The optimizations applied to the runtime:
- **Zero-allocation transaction tracking**: Replaced `Set<NodeId>` tracking in `PatchTransaction` with monotonic `startNodeId` integer range comparison (`nodeId >= startNodeId`), eliminating thousands of `Set.add()` and `Set.has()` operations during large mounts.
- **Leaf primitive text fast path in JSX mount**: Directly creates and inserts text nodes on unattached parent elements when `props.children` is a string or number, bypassing `reconcileChildren` call overhead, array normalization checks, and sibling traversal.
- **Zero-allocation `commitCreatedOnly`**: Replaced temporary `projectedParents` Map tracking with direct `node.parentId !== null` detection and cached node/parent propagation throughout recursive descent, eliminating Map hash overhead and allocations during fresh subtree commits.
- **Fast-path `insertCreatedRange` & `linkCreatedChild`**: Direct `appendChild`/`insertBefore` for freshly created nodes without C++/Blink boundary crossings (`parentNode`, `instanceof Element`, `CharacterData`), combined with streamlined linking that prunes descendant cycle walks.
- **Single-pass child record reuse in `reconcileOrderedChildren`**: Replaced two-pass iteration with single-pass `matchedRecords` caching and indexed array iteration, avoiding thousands of duplicate registry lookups and `.at(-1)` prototype dispatches.
- **Top-level closure-free array flattening**: Moved array flattening to a static `flattenChild` routine with raw indexed loops, eliminating closure allocations and `Array.prototype.forEach` call frames.
- **Single-pass fresh-tree commit (`commitCreatedOnly`)**: Fuses structural validation, registry linking, and DOM appending into a single linear pass for newly created subtrees, bypassing two-pass validation overhead and eliminating temporary `Set` allocations.
- **Multi-slot MRU locality caching in `NodeRegistry`**: 4-slot node cache and 2-slot owner cache with unrolled MRU updates, turning sequential sibling and parent lookups into direct variable hits and avoiding Map hash overhead.
- **Zero-DOM SVG namespace resolution**: Caches an `isSvg` flag on `FlatNode` during root and element creation, completely eliminating cross-boundary `node.domStart.namespaceURI` DOM property reads.
- **Pure JavaScript text diffing**: Compares directly against cached JS string `node.value`, removing native Blink `CharacterData.data` reads during reconciliation and `commitTextOnly`.
- **Keyed reversal fast path**: `reconcileReversedChildren` detects exact reversed permutations in $O(N)$ linear time with zero allocations, bypassing LIS search and feeding pre-ordered arrays to `moveMany`.
- **Direct `appendChild` fast path**: Uses native `appendChild` instead of `insertBefore(node, null)` during range insertions when anchor is null.
- **Cycle-check pruning**: Skips `isDescendant` tree traversal in `linkChild` whenever `node.firstChild === null`.

The update profile is mixed rather than uniformly slower. Unchanged renders are in the same sub-millisecond range as React/Vue, while append/remove and the specialized one-row rotation are competitive or faster in this run. Reverse is where Vue still leads ZUI by about 1.6×; ZUI is about 15× faster than React and 12× faster than Preact for this reversal. Text updates remain closer to React and Vue than mount, with `reconcileMatched`, `applyText`, and the text-only transaction path visible in CPU samples.

The keyed diff now uses a numeric old-index array and byte-mask LIS instead of temporary ID→index Maps/Sets, skips redundant primitive-child reconciliation, and batches pure same-parent move groups into one transaction/undo snapshot. Single-node moves use direct `insertBefore` without per-node fragments; safe cycle checks avoid walking ancestry for fresh leaves and same-parent moves. These optimizations preserve the general keyed/LIS fallback and transaction rollback checks.

A sampled CPU profile at 2,000 rows (Vite development module, 100 μs sampling interval, 80 updates outside mount) shows mount samples around `createNode`, `validate`, `getNode`, `setAttribute`, and `insertBefore`. Reverse profiling continues to point at native `insertBefore`, `validateMoveMany`, `moveChildren`, and sibling-index relinking. The move batch now carries resolved record arrays into the DOM loop, eliminating repeated per-move lookups while retaining full validation. The profiler also reports JIT-inlined `(program)` and garbage-collector samples; counts are hot-function rankings, not exact CPU percentages or comparable timings. Reproduce with `npm run profile:browser`.

The next high-value work is to isolate cold-mount registry/transaction cost and reduce per-record overhead without weakening ownership, ref/focus, safety, or rollback semantics. For reorder, the remaining time is split between DOM insertion and maintaining the authoritative sibling index; any further batching should be judged against Vue at larger and mixed insert/remove/reorder workloads. The [benchmark guide](../benchmarks/README.md) has limitations and reproduction settings.
