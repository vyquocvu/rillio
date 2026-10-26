# Component and data lifecycle evaluation

## Result

Rillio correctly keeps component-local updates local, preserves keyed DOM nodes, and disposes effects on removal. The `useState` path and Zustand selector path both target the component that owns or selects the changed data.

The main scaling limit in the JSX compatibility renderer is parent-driven work: updating a parent reruns every matched descendant component. At 1,000 children, that means 1,000 child function calls for Rillio, React, and Preact in this un-memoized case. Vue skipped the child functions when their props stayed equal. Passing a changed prop to each child reran all 1,000 in every library.

This is enough evidence that Rillio can handle a 1,000-component tree and isolated leaf changes, but it does not establish production readiness for every large application. Keep high-frequency state close to its owner or subscribe at the leaf with a selector. A large, frequently changing parent should be split into smaller update boundaries.

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

The current full unit suite passed with 290 tests, including all 100 matrix cases. The Playwright browser smoke flow also passes the render-scope and TaskFlow ErrorBoundary recovery checks.

## Browser comparison

The current benchmark uses production bundles in fresh Chromium contexts and validates the resulting DOM before timing. It compares Rillio 0.1.0, React/ReactDOM 19.3.0, Preact 11.0.1, and Vue 3.5.43 on an Apple M1 Pro (darwin-arm64), Chromium 156.0.8078.4. The 2026-10-23 run used three warmups, nine samples per context, and three paired repeats. Its JSON report includes every sample, median, P95, MAD, framework version, browser, and run-position count: [`benchmarks/results/2026-10-23-browser-benchmark-post-fix.json`](../benchmarks/results/2026-10-23-browser-benchmark-post-fix.json).

Times below are median milliseconds from that run. A leaf update averages 1,000 updates per sample to get above the browser timer resolution; parent and prop updates average ten. React updates use `flushSync`; Preact updates include its scheduled microtask and Vue updates include `nextTick`. These are observed commit-cycle timings for the hand-written adapters, not a universal ranking.

| Components | Operation | Rillio | React | Preact | Vue | Child functions per update (Rillio / React / Preact / Vue) |
|---:|---|---:|---:|---:|---:|---|
| 100 | Mount | 0.30 | 0.30 | 0.20 | 0.50 | 100 / 100 / 100 / 100 |
| 100 | Local state | 0.0012 | 0.0062 | 0.0017 | 0.0011 | 1 / 1 / 1 / 1 |
| 100 | Parent state, props unchanged | 0.06 | 0.06 | 0.08 | 0.03 | 100 / 100 / 100 / 0 |
| 100 | Parent state, prop changes | 0.11 | 0.07 | 0.08 | 0.19 | 100 / 100 / 100 / 100 |
| 1,000 | Mount | 2.90 | 1.20 | 1.30 | 2.70 | 1,000 / 1,000 / 1,000 / 1,000 |
| 1,000 | Local state | 0.0017 | 0.0546 | 0.0017 | 0.0011 | 1 / 1 / 1 / 1 |
| 1,000 | Parent state, props unchanged | 0.46 | 0.39 | 0.60 | 0.21 | 1,000 / 1,000 / 1,000 / 0 |
| 1,000 | Parent state, prop changes | 1.06 | 0.50 | 0.68 | 1.70 | 1,000 / 1,000 / 1,000 / 1,000 |

All 48 component and 72 list framework/scenario/size preflight contexts passed. At 2,000 keyed rows, Rillio mount remained slower than the other three frameworks, while no-op, text, append/remove, and rotation were within 0.1 ms of the fastest framework. Reverse was 1.1 ms for Rillio, 0.9 ms for Vue, and 6.9 ms for React and Preact:

| 2,000 rows | Rillio | React | Preact | Vue |
|---|---:|---:|---:|---:|
| Mount | 2.90 | 1.20 | 1.40 | 1.10 |
| No-op | 0.30 | 0.40 | 0.70 | 0.40 |
| Text update | 0.60 | 0.60 | 0.90 | 0.70 |
| Append/remove | 0.40 | 0.50 | 0.70 | 0.50 |
| Rotate | 0.30 | 0.50 | 0.80 | 0.50 |
| Reverse | 1.10 | 6.90 | 6.90 | 0.90 |

## Reproduce

Run the 100 lifecycle assertions and print each case's console trace:

```sh
npm test -- --run tests/component-lifecycle-matrix.test.ts --reporter=dot --silent=false
```

Run the browser comparison and save a JSON report:

```sh
RILLIO_BENCH_JSON=1 \
RILLIO_BENCH_SUITE=all \
RILLIO_BENCH_SIZES=100,1000,2000 \
RILLIO_COMPONENT_SIZES=10,100,1000 \
RILLIO_BENCH_WARMUP=3 \
RILLIO_BENCH_SAMPLES=9 \
RILLIO_BENCH_REPEATS=3 \
node benchmarks/browser-playwright.mjs > benchmarks/results/2026-10-23-browser-benchmark-post-fix.json
```

The list workload measures root renders while building a matching keyed host tree. The component workload measures function-component mount, one local leaf update, parent state with stable child props, and a parent update that changes each child's prop. It does not model routing, network I/O, virtualization, SSR/hydration, real-world app composition, or memory pressure.
