# Testing and MVP acceptance

## Commands

```sh
npm install
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run test:oracle
npm run bench:reactive
npm run bench:compat
npm run test:consumer
npm run bench:flat
npm run test:browser
```

`npm run dev` serves all HTML entries, including the hooks playground at `/hooks.html`, keyed list playground at `/keyed.html`, browser benchmark at `/benchmark.html`, and browser smoke fixture at `/e2e.html`. `npm run test:browser` builds the pages, starts Vite preview, and drives the legacy Counter, focused runtime smoke, and legacy Todo flow with a local Chrome/Chromium binary. Set `BROWSER_BIN` when the browser is not in a standard path.

`npm run bench:reactive`, `npm run bench:compat`, and `npm run bench:flat` are exploratory only. They report measured local behavior for reactive invalidation and addressable keyed DOM reconciliation; none should be used to alter preregistered research thresholds or presented as a cross-framework performance claim.

## MVP gates

| ID | Gate | Acceptance |
|---|---|---|
| G1 | Typecheck | `npm run typecheck` exits 0 with strict TS settings |
| G2 | Unit / DOM | `npm test` exits 0; conformance, oracle and jsdom checks |
| G3 | Build | `npm run build` exits 0; both demo entry points verified |
| G4 | Lifecycle | Repeated 100x mount/unmount Show/For/children leaves no retained active effects; event listeners detached |
| G5 | Lists / inputs | Insert, remove, reorder, replace by key, duplicate-key failure; controlled input/checkbox caret/focus sanity |
| G6 | Browser flows | Counter increment; Todo add/edit/toggle/delete/filter and zero-task fallback with no console errors |
| G7 | Consumer package | Built ESM JS + `.d.ts` imported from a separate strict TypeScript/Vite consumer; JSX runtime resolves |
| G8 | Flat Index | Registry structure, transaction validation, seeded randomized updates, and lifecycle disposal remain consistent |

All gates must be recorded against one commit SHA in `docs/STATUS.md`, with environment and commands. Passing older reactive tests **does not** verify newer DOM code.

## Additional regressions to add

- Nested conditional owner disposal during another effect flush; dirty effect disposed before scheduling.
- Two roots mounted independently; disposing root A must not affect root B.
- Re-entrant writes from `For` item updates and nested event handling.
- Keyed move preserves DOM reference, input focus, text-selection/caret, and event listener.
- Form typing with controlled `value` and `checked` remains consistent during flush.
- Dynamic branches that throw during creation clean up partially allocated DOM and effects.
- CSS style removal and URL-sensitive attributes; untrusted data never interpreted as HTML.
- SSR and agent UI security cases deferred until those features exist.

The browser smoke fixture covers state updates, controlled input, focus, keyed DOM identity, caret retention, and uncaught runtime errors. The consumer fixture compiles `tests/consumer-fixture` from a temporary external package directory against generated `dist/package` artifacts.

## Reporting template

```text
Commit SHA:
Date and OS:
Node / npm / TypeScript / browser:
G1 typecheck: PASS | FAIL | NOT RUN
G2 Vitest: PASS | FAIL | NOT RUN  (tests / failed)
G3 Vite build: PASS | FAIL | NOT RUN
G4 lifecycle: PASS | FAIL | NOT RUN
G5 interactions: PASS | FAIL | NOT RUN
G6 E2E: PASS | FAIL | NOT RUN
G7 separate consumer: PASS | FAIL | NOT RUN
Bugs / reproduction / follow-up:
```

Do not modify scientific benchmark thresholds while fixing application bugs. See `research/preregistration.md`.
