# ZUI Roadmap

Updated: 2026-10-09. Source of truth for **frontend product** work. Research has a separate track in `research/`.

## Product objective

Ship a usable **TypeScript/JSX frontend library**: store-first reactive bindings, mount-once components, direct DOM writes, dynamic keyed regions, deterministic disposal, and no virtual DOM. Do not confuse code presence with verified behavior.

## Status legend

- **Implemented / unverified**: code is present, acceptance gate has not been demonstrated.
- **In progress**: work exists but has known gaps.
- **Not started**: no usable implementation.
- **Verified**: typecheck, tests, build and relevant acceptance checks have actually passed at an identified commit.

## Milestones

| ID | Milestone | Status | Ship criteria |
|---|---|---|---|
| M0 | Reactive foundation | Implemented / partially verified | Store/computed/effect/batch, dynamic dependencies, cycle behavior, conformance + disposal tests |
| M1 | JSX and direct DOM | Implemented / unverified | JSX runtime, mount-once text/props/events, typecheck and DOM conformance pass |
| M2 | Dynamic UI | In progress | Show fallback, keyed For insert/remove/reorder/update, stable node identity, invalid-key errors |
| M3 | Lifecycle + correctness | In progress | Full owner cleanup, no stale effects, nested updates deterministic, controlled input semantics |
| M4 | Developer experience | In progress | Typed JSX/props, package JS + declarations, exports, usable downstream TypeScript project, docs |
| M5 | MVP acceptance | Not verified | All gates in `docs/TESTING.md` pass; browser Counter/Todo workflows tested |
| M6 | Post-MVP frontend | Not started | SVG, contexts, portals, SSR/hydration, async boundaries, router integrations only when justified |
| R1 | Reactive benchmark research | Exploratory only | Independent engine comparison following frozen preregistration |
| R2 | Flat Index research | Not started | B0/B1/B2 comparison with overhead/benefit acceptance gates |

## Immediate prioritized backlog (execute sequentially)

### P0 — unblock MVP verification

1. Run `npm install`, `npm run typecheck`, `npm test`, `npm run build` against a pinned revision; fix all actual failures.
2. Fix any JSX TypeScript errors and Node/ESM export mismatches.
3. Verify `<Show>`, `<For>`, component callbacks and disposal under nested updates, including throws.
4. Add browser-level Counter/Todo tests (typing, add/edit/toggle/delete/filter/reorder; focus/caret checks).
5. Add mount/unmount leak assertions using active-computation diagnostics.

### P1 — library distribution

6. Produce separate library build (ESM .js, .d.ts and JSX runtime exports); do not publish raw .ts exports as package entry points.
7. Test consumer importing `zui` in a separate Vite+TypeScript project.
8. Document minimal stable public API; minimize `any` and type DOM intrinsic props.

### P2 — after passing MVP gates

9. Measure baseline performance against vanilla DOM/Solid with realistic workloads.
10. Research Index and UI patch protocol separately; retain only on demonstrated value.

## MVP v0.1 definition of done

All seven conditions must pass **on the same commit**: strict typecheck; Vitest conformance/DOM tests; Vite build; Counter+Todo browser flows; no retained active effects after repeated unmount; stable keyed identity/correct updates; distributable JS+declarations consumed by a separate project. Record command, environment, SHA and actual outputs in `docs/STATUS.md`. No claim of pass without execution evidence.

## Explicit non-goals for MVP

Flat Index, agent-authored patches, SSR, hydration, router, portals, elaborate scheduler benchmarks, performance superiority claims, CI/CD. These must not delay M0–M5.

## Change control

If scope changes, edit this document and `docs/STATUS.md` together; do not retroactively alter research thresholds in `research/preregistration.md`. Keep correctness/verification distinct from implementation progress.
