# Contributing to Rillio

Rillio is a research-backed frontend library prototype. Prioritize correctness and usability over novelty.

## Local development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

No CI/CD has been requested; run and report checks locally.

## Change rules

1. Choose one task from `ROADMAP.md` and keep the patch scoped.
2. Add a regression test for a behavior change, especially owners, batching, Show, keyed For and controlled inputs.
3. Distinguish **implemented** from **verified**. Record real results in `docs/STATUS.md`.
4. Do not turn Rillio into a Virtual DOM renderer to fix a local bug without an explicit design decision.
5. Do not treat `any` JSX declarations as final public API design.
6. Preserve stable-key DOM identity when list data changes.
7. Never silently merge agent/patch ownership with store-controlled properties in future research.
8. If a benchmark hypothesis changes, version the protocol instead of rewriting pre-registered thresholds.

## Documentation map

- `ROADMAP.md`: product gates, priorities and research split.
- `docs/ARCHITECTURE.md`: runtime design and lifecycle.
- `docs/API.md`: current user-facing API and limitations.
- `docs/TESTING.md`: test commands and acceptance rubric.
- `docs/STATUS.md`: evidence-based current state.
- `research/`: reactive semantics, verification history and benchmark preregistration.
