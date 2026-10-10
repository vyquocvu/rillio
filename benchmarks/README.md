# Benchmarks

These commands are exploratory measurements for local development. They do not replace the preregistered research protocol in `research/preregistration.md` and do not establish a production performance claim.

## Reactive engine

```sh
npm run bench:reactive
```

The benchmark compares `scan` and `graph` invalidation with one affected store and many unrelated subscriptions. It reports average update time, visited computations, and selector evaluations for several subscription counts.

## Browser renderer

```sh
npm run dev
```

Open `/benchmark.html` and select a row count. The page measures synchronous updates of keyed DOM rows in the current browser. Browser measurements are sensitive to hardware, browser version, devtools, thermal state, and background work; compare runs only under the same conditions.

## Interpretation

- Run several times and look for stable ranges, not a single best result.
- Keep scan/graph ordering balanced for any serious experiment.
- Do not change preregistered thresholds based on these exploratory scripts.
