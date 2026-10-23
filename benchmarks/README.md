# Benchmarks

These commands are exploratory measurements for local development. They do not replace the preregistered research protocol in `research/preregistration.md` and do not establish a production performance claim.

## Reactive engine

```sh
npm run bench:reactive
```

The benchmark compares `scan` and `graph` invalidation with one affected store and many unrelated subscriptions. It reports average update time, visited computations, and selector evaluations for several subscription counts.

## Browser renderer

The interactive [`/benchmarks.html`](../benchmarks.html) page runs keyed-list cases in the current browser tab and leaves all four rendered previews visible. It reports median/P95 timings, tree-build and renderer/layout phases, exact element/text/comment counts, plus the browser's page-wide heap estimate and device hints where exposed. Its timings include a forced style/layout read and are hands-on diagnostics; they are not numerically comparable to the isolated Playwright protocol below. For timing comparisons, run `npm run build`, start `npx vite preview --host 127.0.0.1`, and open `http://127.0.0.1:4173/benchmarks.html`; the page marks dev-server timings as diagnostic.

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

The full 2026-10-23 production run is saved at [`results/2026-10-23-browser-benchmark-post-fix.json`](results/2026-10-23-browser-benchmark-post-fix.json). It passed 72 list and 48 component preflight contexts, then collected three paired repeats with nine samples per fresh context. The parent-update preflight expects every child function to run in ZUI, React, and Preact, while Vue skips unchanged child props; local updates must render one child in every framework.

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

## CPU and memory usage

```sh
npm run bench:cpu-memory
```

`bench:browser` answers "how long does this take". This runner answers "how much CPU and how much memory does it cost", against the same production bundle, the same four frameworks, and the same keyed-list workloads and DOM assertions. It is a separate script so the documented timing protocol in `bench:browser` stays untouched.

CPU comes from deltas of Chromium's cumulative `Performance.getMetrics` counters across a measured window, not from wall-clock timing. `ThreadTime` is the headline figure: main-thread CPU time, which includes style recalc, layout and GC. `TaskDuration`, `RecalcStyleDuration` and `LayoutDuration` are reported alongside it. Memory comes from `Runtime.getHeapUsage` after forced GC, and node/listener counts from `Memory.getDOMCounters`.

### Protocol

Each measured run gets a fresh browser context and CDP session, and proceeds in phases so the runner can read counters between them:

1. Untimed warmup cycles replay the full mount/update/unmount path.
2. Heap baseline on the warmed, empty page.
3. Input rows are materialized, then a second baseline is taken. Because benchmark inputs exist before this baseline, they are excluded from every memory delta.
4. Mount, then update, each inside its own counter window.
5. Unmount, then release of the input data, each followed by forced GC.

Three details matter for reading the output:

- **DOM assertions run in their own page phase, outside every counter window.** Correctness is still checked after mount and after every update batch, but it is not charged to any framework.
- **Each phase ends by forcing style recalc and layout** (reading `document.body.offsetHeight`). Headless Chromium otherwise defers rendering until it produces a frame, so without the flush every framework measures exactly `0.000` ms of style and layout and the rendering cost of its DOM writes lands outside the window.
- **Root creation is excluded** from mount, matching the mount scenario in `bench:browser`.

### Output

`retainedTreeBytes` is the cost of holding one rendered tree: heap after forced GC while mounted, minus the input-data baseline. `allocatedBytes` is update-phase allocation pressure, read before any GC. `frameworkResidualBytes` and `pageResidualBytes` are heap that survives unmount plus forced GC. `nodesAfterUnmount` and `listenersAfterUnmount` are exact counters, unlike the heap figures: nonzero means DOM or listeners genuinely survived teardown.

`nodesMounted` is identical across frameworks for a given size, which is a useful check that all four are being handed the same work.

The full 2026-10-23 run is saved at [`results/2026-10-23-cpu-memory-post-fix.json`](results/2026-10-23-cpu-memory-post-fix.json). It passed 60 correctness preflight contexts and used the default three sizes, five update workloads, four frameworks, 20 updates per measured window, three warmups, and three paired repeats. For ZUI at 2,000 rows, retained-tree heap was about 863–864 KB across workloads; all scenarios reported zero nodes and listeners after unmount. The same exact counters found one surviving listener in the React harness, with zero surviving DOM nodes. Heap residuals remain single-cycle diagnostics rather than proof of leaks.

### Limitations

- **Warmup is not optional.** With `ZUI_CPU_MEM_WARMUP=0` the empty-page heap baseline is cold, and residual heap reads 142-440 KB per framework instead of the converged 16-33 KB. Cold runs also flatten CPU differences: all four frameworks measured within 1.6 ms of each other on a workload where warmed runs separate them. Residual heap converged by three warmup cycles and did not improve at six, so three is the default.
- **Residual heap is not proven leakage.** A single cycle cannot separate a real leak from framework caches, unsettled old-space, or GC timing. Treat it as residual and inspect the raw runs across paired repeats before calling anything a leak.
- **`ScriptDuration` and `V8CompileDuration` are not reported.** Chromium 156 exposes both through `Performance.getMetrics` but leaves them at exactly `0`: an 8M-iteration pure-JS loop that consumed 11.7 ms of `ThreadTime` moved neither. A JS-only CPU breakdown is therefore unavailable, and printing those columns would show misleading zeros. The runner names them in its output instead of reporting them as data.
- The harness overhead floor is measured by timing empty `page.evaluate` windows and printed with the results. CPU deltas near that floor are not resolvable.

### Configuration

```sh
ZUI_CPU_MEM_SIZES=100,1000 ZUI_CPU_MEM_SCENARIOS=text,reverse ZUI_CPU_MEM_UPDATES=40 npm run bench:cpu-memory
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `ZUI_CPU_MEM_SIZES` | `100,1000,2000` | Keyed rows per list |
| `ZUI_CPU_MEM_SCENARIOS` | `noop,text,append-remove,rotate,reverse` | Update workloads; mount is always measured as its own phase |
| `ZUI_CPU_MEM_FRAMEWORKS` | `zui,react,preact,vue` | Frameworks to compare |
| `ZUI_CPU_MEM_UPDATES` | `20` | Updates per measured run |
| `ZUI_CPU_MEM_WARMUP` | `3` | Untimed warmup cycles per run (max 50) |
| `ZUI_CPU_MEM_WARMUP_UPDATES` | `5` | Updates per warmup cycle; capped to keep warmup cheap |
| `ZUI_CPU_MEM_REPEATS` | `3` | Paired repeats; framework order is randomized and rotated |
| `ZUI_CPU_MEM_SEED` | `20261023` | Run-order seed |
| `ZUI_CPU_MEM_CALIBRATION` | `9` | Empty-window samples used for the overhead floor |
| `ZUI_CPU_MEM_JSON` | unset | Set to `1` to print the full report, including p95, MAD and raw runs |
| `ZUI_CPU_MEM_OUT` | unset | Path to write the JSON report |

A full default run opens 240 browser contexts and takes on the order of twenty minutes. Narrow `ZUI_CPU_MEM_SIZES` and `ZUI_CPU_MEM_SCENARIOS` for a quick check.

## Interpretation

- Run several times and look for stable ranges, not a single best result.
- Keep scan/graph ordering balanced for any serious experiment.
- Do not change preregistered thresholds based on these exploratory scripts.
