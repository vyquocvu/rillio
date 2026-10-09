# Verification report — 2026-10-09

## Executed locally (isolated TypeScript/Node copy)

The GitHub repository could not be cloned from the execution container because github.com DNS resolution failed. The current reactive source was obtained through the GitHub connector, reconstructed locally, compiled using TypeScript 5.8.3 and exercised under Node.js v22.16.0.

- TypeScript compile with `--target es2022 --module nodenext --strict --skipLibCheck`: PASS
- Standalone behavioral smoke checks: 16/16 PASS
- Independent seeded expression oracle: 2,400/2,400 state updates PASS across 80 generated programs (40 seeds per engine)
- Extra checks: computed purity and cleanup reads not becoming dependencies: PASS

## Not yet independently verified

- The full Vitest suite (`npm test`) was **not run** in this environment; dependencies could not be installed through the repository.
- The standalone tests exercise a reconstructed copy, not a fresh Git checkout of the exact GitHub commit.
- The scan and graph modes currently share evaluation/ownership machinery, so the research requirement for two independent engine implementations is **not met**.
- The exploratory benchmark is not confirmatory. No preregistered performance claims are warranted.
- No JSX/DOM runtime, keyed list, Flat Index or agent transaction protocol yet.

## Outstanding technical risks

- Effect exception and scheduler retry semantics need stronger tests.
- Computed lifecycle and ownership during nested effect execution need design work.
- Store equality currently uses Object.is on the whole value; mutating objects in place is outside the immutable snapshot contract.
- Scan visits all active effects by design and graph only visits dirty effects, but their shared implementation may confound a scientific comparison.

Do not mark Spike 0 complete until the entire Vitest suite runs, independent engine implementations pass conformance, and the oracle/fuzz and external semantic crosschecks are complete.
