# ZUI Status — React/Preact runtime refactor

Updated: 2026-10-09. Documentation is based on code changes; **tests and build are not independently executed** on this revision.

## New default runtime

- `src/compat.ts`: JSX element descriptions, component snapshots, hook slots and direct-DOM reconciliation.
- Public `zui` / `zui/jsx-runtime` exports now point to compat runtime.
- Source APIs: `createRoot`, `render`, `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`.
- Component returns may be null, fragments, arrays or native JSX nodes.
- Keyed list reconciler preserves host element identity for same type/key.
- `tests/compat.test.ts` added for state, keyed lists, effects, memo/ref, arrays/null.
- `examples/compat-todo.tsx`, `compat.html` added.

## Preserved legacy

- `zui/legacy` -> old mount-once runtime in `src/dom.ts`.
- `zui/reactive` -> existing reactive graph/scan engine.
- Existing source demos explicitly updated to `zui/legacy`.

## Verification

- Full `npm run typecheck`: **NOT RUN / NOT VERIFIED**
- Full `npm test`: **NOT RUN / NOT VERIFIED**
- Full `npm run build`: **NOT RUN / NOT VERIFIED**
- Browser E2E: **NOT RUN**
- Consumer package ESM+declarations: **NOT IMPLEMENTED**
- React/Preact behavioral parity: **NOT CLAIMED**

## Known gaps / risks

- Hook-order validation and render-phase writes need hardening.
- Effects execute immediately after DOM commit (not React post-paint).
- No automatic update batching, concurrent scheduling, context, reducer, portal or SSR.
- JSX types too permissive, package exports raw TypeScript.
- DOM/SVG props/events do not fully match React/Preact.

Next: execute typecheck/test/build, fix failures, stress keyed reconciliation/hooks/unmount, then implement remaining common semantics. See [ROADMAP](../ROADMAP.md) and [Compatibility](COMPATIBILITY.md).
