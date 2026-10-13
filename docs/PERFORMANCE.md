# Renderer performance

## Reproduce

```sh
npx playwright install chromium
npm run bench:browser
```

Playwright launches headless Chromium and compares synchronous keyed-list workloads across ZUI, React, Preact, and Vue. The benchmark validates final DOM state in untimed preflight contexts, then uses three paired repeats, three warmups, and nine samples per context. Tree construction is included; shared input-data updates and root creation are excluded. Run `ZUI_BENCH_JSON=1 npm run bench:browser` for raw timings, per-context medians, tree/commit split, exact framework versions, and randomized run-position counts. Sizes and sampling settings are configurable as documented in the [benchmark guide](../benchmarks/README.md).

This is a runtime-level keyed-tree comparison, not a comparison of complete apps or equivalent programming models. React is forced synchronous with `flushSync`; React documents this as an uncommon escape hatch that can hurt performance. Preact and Vue use their `h`/`render` runtime APIs directly; compiler-driven Solid/Svelte workloads are intentionally kept out until they have separate compiled adapters. These local measurements do not establish a cross-machine or production ranking.

## Latest local comparison

Run on 2026-10-13 in Playwright-controlled Chromium 156.0.8078.4 on macOS arm64 (Apple M1 Pro). Versions: ZUI 0.0.1, React/ReactDOM 19.3.0, Preact 11.0.1, Vue 3.5.43. The run covered 1,000, 2,000, and 5,000 rows, with 27 raw timings per framework/workload/size and 72 passing untimed preflight contexts. Times are medians in milliseconds, rounded to 0.1 ms.

| Rows | Scenario | ZUI | React | Preact | Vue |
|---:|---|---:|---:|---:|---:|
| 1,000 | mount | 1.6 | 0.6 | 0.7 | 0.5 |
| 1,000 | unchanged | 0.2 | 0.2 | 0.4 | 0.2 |
| 1,000 | text update | 0.5 | 0.3 | 0.4 | 0.4 |
| 1,000 | append/remove | 0.2 | 0.2 | 0.4 | 0.2 |
| 1,000 | rotate one row | 0.2 | 0.3 | 0.4 | 0.3 |
| 1,000 | reverse | 0.9 | 2.4 | 2.0 | 0.4 |
| 2,000 | mount | 3.0 | 1.1 | 1.4 | 1.1 |
| 2,000 | unchanged | 0.3 | 0.4 | 0.7 | 0.4 |
| 2,000 | text update | 1.0 | 0.6 | 0.8 | 0.7 |
| 2,000 | append/remove | 0.3 | 0.5 | 0.7 | 0.5 |
| 2,000 | rotate one row | 0.3 | 0.5 | 0.7 | 0.5 |
| 2,000 | reverse | 1.6 | 8.1 | 6.4 | 0.9 |
| 5,000 | mount | 6.9 | 2.5 | 3.2 | 2.3 |
| 5,000 | unchanged | 0.5 | 0.9 | 1.6 | 0.7 |
| 5,000 | text update | 2.2 | 1.3 | 1.8 | 1.6 |
| 5,000 | append/remove | 0.7 | 0.9 | 1.6 | 0.7 |
| 5,000 | rotate one row | 0.6 | 1.1 | 1.6 | 1.2 |
| 5,000 | reverse | 3.8 | 44.9 | 36.0 | 2.0 |

At 5,000 rows, reverse MAD/p95 were React 3.4/50.2 ms, Preact 0.2/37.5 ms, ZUI 0.2/4.6 ms, and Vue 0.1/2.5 ms. Treat this as evidence about this particular full-reversal workload, not a general framework ranking. The benchmark timer displays 0.1 ms precision; values rounded to 0.0 in JSON are below display precision, not literally zero.

## What the measurements say

Tree construction is small beside ZUI's synchronous renderer work. At 5,000 rows, the tree-build medians range from 0.1–0.4 ms; ZUI's mount update phase is 6.7 ms versus 2.4 ms for React, 3.1 ms for Preact, and 1.9 ms for Vue. For reverse, ZUI's tree build is 0.1 ms versus 0.2–0.4 ms for the others, while its update phase is 3.8 ms versus Vue's 1.6 ms. The largest persistent gap is therefore not VNode creation: it is addressable-record/owner bookkeeping, transaction validation, and DOM commit. At 5,000 rows ZUI mount is 2.8× React and 3.0× Vue; full text update is 1.7× React and 1.4× Vue.

The update profile is mixed rather than uniformly slower. Unchanged renders are in the same sub-millisecond range as React/Vue, while append/remove and the specialized one-row rotation are competitive or faster in this run. Reverse is where Vue still leads ZUI by about 1.9×; ZUI is about 12× faster than React and 9.5× faster than Preact for this reversal. Text updates are closer to React and Vue than mount, with `reconcileMatched`, `applyText`, and the text-only transaction path visible in CPU samples.

The keyed diff now uses a numeric old-index array and byte-mask LIS instead of temporary ID→index Maps/Sets, skips redundant primitive-child reconciliation, and batches pure same-parent move groups into one transaction/undo snapshot. Single-node moves use direct `insertBefore` without per-node fragments; safe cycle checks avoid walking ancestry for fresh leaves and same-parent moves. These optimizations preserve the general keyed/LIS fallback and transaction rollback checks.

A sampled CPU profile at 5,000 rows (Vite development module, 100 μs sampling interval, 24 updates) showed mount samples around `createNode`, `validate`, `getNode`, `insertBefore`, and `setAttribute`. Reverse samples included native `insertBefore`, `reconcileChildren`, `moveChildren`, `validateMoveMany`, and sibling-index relinking. The profiler also reports JIT-inlined `(program)` and garbage-collector samples; counts are hot-function rankings, not exact CPU percentages or comparable timings. Reproduce with `npm run profile:browser`.

The next high-value work is to isolate cold-mount registry/transaction cost and reduce per-record overhead without weakening ownership, ref/focus, safety, or rollback semantics. For reorder, the remaining time is split between DOM insertion and maintaining the authoritative sibling index; any further batching should be judged against Vue at larger and mixed insert/remove/reorder workloads. The [benchmark guide](../benchmarks/README.md) has limitations and reproduction settings.
