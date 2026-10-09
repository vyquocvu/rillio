# ZUI Status Snapshot

As of 2026-10-09. **Documentation-only snapshot** based on repository inspection; no new execution claims.

## Code present

- Reactive primitives, graph invalidation, ownership API, oracle/smoke tests.
- TypeScript automatic JSX runtime, direct DOM bindings, mount-once component functions, Show and keyed For.
- Counter and Todo source demos; Vite commands; jsdom-focused unit tests.
- Current npm package: `version: 0.0.1`, `private: true`, exports point to TypeScript source.

## Verification gates (current revision)

| Gate | Evidence status |
|---|---|
| G1 strict typecheck | NOT VERIFIED on frontend commit |
| G2 full Vitest | NOT VERIFIED on frontend commit |
| G3 Vite build | NOT VERIFIED on frontend commit |
| G4 100x mount/dispose leak checks | NOT IMPLEMENTED / NOT VERIFIED |
| G5 comprehensive lists/forms correctness | PARTIAL TESTS; NOT FULLY VERIFIED |
| G6 browser E2E | NOT VERIFIED |
| G7 distributable JS + types consumer | NOT IMPLEMENTED |

Historical isolated reactive-only checks are documented in `research/verification.md`; they are **not evidence** that frontend MVP passed. The earlier research report predates JSX/DOM changes.

## Next action

Run G1–G3 first, capture failures, repair them and then complete G4–G7. Once all pass at the same SHA, label MVP v0.1 verified. Until then: **implementation present, MVP not verified**.

## Incremental update — React-friendly dependency isolation

Implemented `ReactiveEngine.untrack`, exported frontend `untrack`, and used it around nested owner construction to avoid spurious conditional-region remounts. Added regression cases for child mount isolation and explicit untracked reads. **New tests have not been executed on the current commit**; all G1–G7 acceptance gates remain unverified until recorded run evidence exists.
