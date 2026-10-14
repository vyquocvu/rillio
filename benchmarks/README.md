# Benchmarks

These commands are exploratory measurements for local development. They do not replace the preregistered research protocol in `research/preregistration.md` and do not establish a production performance claim.

## Reactive engine

```sh
npm run bench:reactive
```

The benchmark compares `scan` and `graph` invalidation with one affected store and many unrelated subscriptions. It reports average update time, visited computations, and selector evaluations for several subscription counts.

## Browser renderer

The old interactive `/benchmark.html` fixture was removed during demo consolidation. Use the Playwright production-bundle comparison below for current browser renderer measurements.

### ZUI vs React, Preact, and Vue in Chromium

```sh
npx playwright install chromium
npm run bench:browser
```

This builds a temporary production bundle and compares synchronous keyed-list updates in Playwright-controlled headless Chromium. Scenarios cover mount, unchanged renders, text changes, append/remove, a one-item rotation, and reversal. ZUI, React, Preact, and Vue all receive the same keyed rows and are checked against the same DOM after every preflight update. Each measured run gets a fresh browser context; framework order is randomized and rotated across paired repeats. The default list suite performs three paired repeats, with three warmups and nine measured updates per context (27 raw timings per framework/scenario/size). Tree construction is included; the shared input-data update is not. Exact installed framework versions and run-order counts are included in the report. These are dev-only benchmark dependencies and are not included in the published runtime.

The same runner also measures component lifecycles: mounting 10/100/1,000 child components, changing state in one leaf, updating parent state with stable child props, and updating a prop across all children. The component preflight checks DOM output and render counts. React uses `flushSync`, Preact's scheduled update is flushed through a microtask, and Vue updates are measured through `nextTick`. Leaf timing batches 1,000 updates per sample; parent and prop updates batch ten. These numbers include each framework's update/commit scheduling and should be read alongside the render counts.

Select a suite and component sizes without editing the runner:

```sh
ZUI_BENCH_SUITE=components ZUI_COMPONENT_SIZES=10,100,1000 npm run bench:browser
ZUI_BENCH_SUITE=list ZUI_BENCH_SIZES=100,1000,2000 npm run bench:browser
```

`ZUI_BENCH_SUITE` accepts `all` (default), `list`, or `components`. The existing `ZUI_BENCH_SIZES` setting applies to list rows; `ZUI_COMPONENT_SIZES` applies to component counts.

This is a runtime-level keyed-tree comparison, not a claim that these frameworks have equivalent programming models. React uses [`createElement`](https://react.dev/reference/react/createElement) plus `createRoot` and [`flushSync`](https://react.dev/reference/react-dom/flushSync) so the measured DOM commit is synchronous; React documents `flushSync` as an uncommon escape hatch that can hurt performance. Preact and Vue use their [`h`/`render` runtime APIs](https://preactjs.com/guide/v10/api-reference/) and [render-function APIs](https://vuejs.org/api/render-function) directly, while ZUI uses its JSX-compatible runtime. Compiler-driven or fine-grained frameworks (for example Solid or Svelte) need their own compiled adapters and workload before a fair comparison; they are intentionally not folded into this table.

The summary reports each framework's median and ZUI/framework ratios. The JSON report also includes p95 and median absolute deviation (MAD), calculated from all raw timings pooled across paired repeats, plus separate medians for tree construction and synchronous render/update. Sub-0.1 ms phase values are below the CLI table's display precision. Set `ZUI_BENCH_JSON=1` to print the complete report, including raw timings and per-context medians, as JSON. The seed, browser/OS/CPU metadata, framework versions, and run-position counts are included so a run can be reproduced and its noise inspected. These remain local diagnostics, not a cross-machine performance guarantee.

Tune the workload without editing the script:

```sh
ZUI_BENCH_SIZES=100,1000,5000 ZUI_BENCH_SAMPLES=15 ZUI_BENCH_WARMUP=5 ZUI_BENCH_REPEATS=5 ZUI_BENCH_SEED=42 npm run bench:browser
```

For a sampled CPU hot-function ranking (not timing data), run the Playwright-controlled Chromium profiler:

```sh
npm run profile:browser
ZUI_PROFILE_SIZE=5000 ZUI_PROFILE_UPDATES=120 npm run profile:browser
```

It profiles the Vite development module, keeps mount roots alive until sampling stops, and unmounts afterward so teardown does not contaminate mount samples. It samples mount, text, no-op, and reverse-keyed updates. Defaults are 2,000 rows, 20 simultaneously mounted roots, 80 text/no-op/reverse updates, and a 100 μs sampling interval. Use the output to rank visible functions only; JIT inlining, browser-native work, and profiler overhead mean sample counts are not exact CPU percentages or comparable benchmark timings.

## Interpretation

- Run several times and look for stable ranges, not a single best result.
- Keep scan/graph ordering balanced for any serious experiment.
- Do not change preregistered thresholds based on these exploratory scripts.
