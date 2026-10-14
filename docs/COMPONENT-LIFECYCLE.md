# Component and data lifecycle evaluation

## Result

ZUI correctly keeps component-local updates local, preserves keyed DOM nodes, and disposes effects on removal. The `useState` path and Zustand selector path both target the component that owns or selects the changed data.

The main scaling limit in the JSX compatibility renderer is parent-driven work: updating a parent reruns every matched descendant component. At 1,000 children, that means 1,000 child function calls for ZUI, React, and Preact in this un-memoized case. Vue skipped the child functions when their props stayed equal. Passing a changed prop to each child reran all 1,000 in every library.

This is enough evidence that ZUI can handle a 1,000-component tree and isolated leaf changes, but it does not establish production readiness for every large application. Keep high-frequency state close to its owner or subscribe at the leaf with a selector. A large, frequently changing parent should be split into smaller update boundaries.

## 100-case lifecycle matrix

[`tests/component-lifecycle-matrix.test.ts`](../tests/component-lifecycle-matrix.test.ts) defines ten lifecycle cases at ten component counts: 1, 2, 5, 10, 25, 50, 100, 250, 500, and 1,000. Vitest prints a `[lifecycle-matrix] PASS` line for each case, including the component render trace and cleanup count.

| Lifecycle case | What it checks |
|---|---|
| Initial mount | Each child renders once and the expected DOM is present |
| Local state update | Only the owning child function runs; existing DOM nodes remain |
| Same-value update | `Object.is` same-value state writes do no work |
| Parent state update | Parent and descendant render counts are visible; DOM nodes remain |
| Prop fan-out | Updated parent props reach all child components without replacing their host nodes |
| Zustand selector update | Only the child selecting the changed store field runs |
| Keyed reorder | DOM order changes while each keyed node retains its identity |
| Keyed removal | Removed child cleanup runs once; remaining nodes retain identity |
| Root unmount | Every mounted child cleanup runs once and the container empties |
| Setter after unmount | A retained state setter does not render or throw after disposal |

The full unit suite passed with 265 tests, including all 100 matrix cases. Existing resource tests and the browser smoke flow also cover async resource resolution/refetch and keyed reactive data updates.

## Browser comparison

The benchmark uses production bundles in fresh Chromium contexts and validates the resulting DOM before timing. It compares ZUI 0.1.0, React/ReactDOM 19.3.0, Preact 11.0.1, and Vue 3.5.43 on an Apple M1 Pro (darwin-arm64), Chromium 156.0.8078.4. The run used one warmup, five samples per context, and two paired repeats. The JSON report contains every sample, median, P95, MAD, version, browser, and run-position count: [`benchmarks/results/2026-10-14-browser-benchmark.json`](../benchmarks/results/2026-10-14-browser-benchmark.json).

Times below are median milliseconds from that run. A leaf update averages 1,000 updates per sample to get above the browser timer resolution; parent and prop updates average ten. React updates use `flushSync`; Preact updates include its scheduled microtask and Vue updates include `nextTick`. These are observed commit-cycle timings for the hand-written adapters, not a universal ranking.

| Components | Operation | ZUI | React | Preact | Vue | Child functions per update (ZUI / React / Preact / Vue) |
|---:|---|---:|---:|---:|---:|---|
| 100 | Mount | 0.50 | 0.50 | 0.30 | 0.60 | 100 / 100 / 100 / 100 |
| 100 | Local state | 0.0010 | 0.0065 | 0.0017 | 0.0012 | 1 / 1 / 1 / 1 |
| 100 | Parent state, props unchanged | 0.07 | 0.07 | 0.08 | 0.03 | 100 / 100 / 100 / 0 |
| 100 | Parent state, prop changes | 0.10 | 0.07 | 0.09 | 0.19 | 100 / 100 / 100 / 100 |
| 1,000 | Mount | 2.90 | 1.40 | 1.90 | 4.00 | 1,000 / 1,000 / 1,000 / 1,000 |
| 1,000 | Local state | 0.0011 | 0.0572 | 0.0017 | 0.0012 | 1 / 1 / 1 / 1 |
| 1,000 | Parent state, props unchanged | 0.46 | 0.44 | 0.67 | 0.24 | 1,000 / 1,000 / 1,000 / 0 |
| 1,000 | Parent state, prop changes | 0.96 | 0.52 | 0.74 | 1.59 | 1,000 / 1,000 / 1,000 / 1,000 |

The component cases passed correctness preflight in 48 isolated framework/scenario/size contexts. The list benchmark passed 72. The list numbers at 2,000 keyed rows show ZUI competitive on most updates, with reverse close to Vue and faster than React/Preact in this run; initial mount remains behind React and Vue:

| 2,000 rows | ZUI | React | Preact | Vue |
|---|---:|---:|---:|---:|
| Mount | 2.20 | 1.30 | 1.60 | 1.20 |
| No-op | 0.40 | 0.50 | 0.80 | 0.50 |
| Text update | 0.70 | 0.60 | 0.90 | 0.80 |
| Append/remove | 0.50 | 0.50 | 1.00 | 0.50 |
| Rotate | 0.40 | 0.50 | 0.90 | 0.60 |
| Reverse | 1.20 | 7.10 | 7.10 | 1.10 |

## Reproduce

Run the 100 lifecycle assertions and print each case's console trace:

```sh
npm test -- --run tests/component-lifecycle-matrix.test.ts --reporter=dot --silent=false
```

Run the browser comparison and save a JSON report:

```sh
ZUI_BENCH_JSON=1 \
ZUI_BENCH_SUITE=all \
ZUI_BENCH_SIZES=100,1000,2000 \
ZUI_COMPONENT_SIZES=10,100,1000 \
ZUI_BENCH_WARMUP=1 \
ZUI_BENCH_SAMPLES=5 \
ZUI_BENCH_REPEATS=2 \
node benchmarks/browser-playwright.mjs > benchmarks/results/2026-10-14-browser-benchmark.json
```

The list workload measures root renders while building a matching keyed host tree. The component workload measures function-component mount, one local leaf update, parent state with stable child props, and a parent update that changes each child's prop. It does not model routing, network I/O, virtualization, SSR/hydration, real-world app composition, or memory pressure.
