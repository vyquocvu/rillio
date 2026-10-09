# ZUI Roadmap — React / Preact-first (revised 2026-10-09)

> **Architectural decision:** public syntax follows React/Preact (standard JSX, snapshots, hooks, normal conditionals and keyed `.map()`). Compatibility takes precedence over the old mount-once guarantee. Keep legacy runtime available at `zui/legacy`.

## Product principles

1. Normal React/Preact TSX without `Show`, `For`, `derive` or function children.
2. Small runtime, direct DOM mutation, predictable keyed identity.
3. React/Preact behavior must be **tested** before claiming compatibility.
4. Preserve the reactive research engine under `zui/reactive`, not as mandatory application API.
5. Avoid CI/CD unless deliberately requested.

## Milestones

| Phase | Target | Implementation status | Verification |
|---|---|---|---|
| C0 | JSX, createRoot, render | Source implemented | Unverified |
| C1 | useState, useEffect, useMemo, useCallback, useRef | Source implemented | Unverified |
| C2 | Component rerender + keyed direct-DOM reconcile | Source implemented | Unverified; coverage incomplete |
| C3 | Props/events/ref/forms reconciliation | Partially implemented | Unverified |
| C4 | Hook semantics, scheduler, deterministic batching, cleanup, errors | Not complete | Not verified |
| C5 | Context, useReducer, useLayoutEffect, memo, forwardRef | Not started | Not verified |
| C6 | TS JSX prop typing, ESM + declarations package, downstream consumer | Not started | Not verified |
| C7 | Browser E2E, test matrix, perf/correctness gates and release candidate | Not started | Not verified |
| R1 | Reactive scan/graph scientific benchmark | Research track | See `research/preregistration.md` |
| R2 | Flat Index / addressable UI | Research track | Deferred |

## Next tasks — strict priority

1. **P0:** Run `npm run typecheck`, `npm test`, `npm run build` at a pinned SHA; fix all failures and record outputs.
2. **P0:** Exercise component replacement, keyed reorder/delete/insert, nested hooks, ref attach/detach and 100x mount/unmount.
3. **P0:** Define scheduler, batching, hook call ordering, render-phase writes, effect commit ordering and exception behavior.
4. **P0:** Ensure controlled input behavior and event compatibility for `onChange`, `onInput`, focus/caret.
5. **P1:** Context + remaining common hooks; SSR/portals later.
6. **P1:** Bundle library as ESM, publish types, test isolated consumer project, improve JSX typing.
7. **P1:** Browser E2E for Counter/Todo; correctness before benchmarking.
8. **P2:** Measure against Preact and React on comparable workloads, then optimize selectively.

## Completion gates for v0.1

- Typecheck, tests and build pass on **the same SHA**.
- `createRoot`, hooks, conditional JSX and keyed arrays have verified tests.
- Unmount cleans effects, event listeners and DOM.
- Separate strict-TS consumer can import JS + .d.ts.
- Browser Counter/Todo workflows pass.
- Explicit list of compatible vs unsupported APIs published.

No claim of "React compatible" or "production ready" until all relevant gates are demonstrated.

## Legacy and migration

Previous store-first/mount-once API is available via `zui/legacy`; reactive engine via `zui/reactive`. Legacy source demos retain explicit imports. The root package `zui` is now the compatibility runtime. Consumers must opt in to the breaking change by changing imports or waiting for a stable release. See `docs/COMPATIBILITY.md`.

## Documentation map

- `docs/COMPATIBILITY.md`: supported semantics and deliberate gaps.
- `docs/ARCHITECTURE.md`: historical reactive architecture (legacy context).
- `docs/TESTING.md`: previous acceptance plan, to be updated for compat.
- `docs/STATUS.md`: evidence history; requires fresh run on compat commit.
- `research/`: scientific research isolated from compatibility release.
