# ZUI Status — Release hardening

Updated: 2026-10-10. Verification ran against the working tree based on `7e366c947acbc420ab84038a2261eecde8b3187e`; changes are not committed yet.

## Implemented

- Default `zui` runtime now has hook-order checks, render-phase update guards, root reuse, keyed reconciliation, effect cleanup isolation, and mount rollback.
- `zui/legacy` and `zui/reactive` remain available as explicit legacy entry points.
- Release packaging emits ESM JavaScript and declarations under `dist/package`.
- Example gallery includes hooks, keyed lists, modern and legacy benchmarks, and the existing todo/react-friendly demos.
- Benchmark scripts cover reactive graph-vs-scan updates and compat keyed reconciliation.
- Browser smoke fixture covers state, controlled input, focus, keyed identity, caret retention, and uncaught runtime errors.
- Separate consumer fixture compiles against generated package ESM, declarations, JSX runtime, and legacy/reactive subpaths.

## Verification

- Environment: Node v26.5.0, npm 12.0.2, TypeScript 5.9.3, Vitest 5.0.3, Vite 6.4.4, Chrome 154.0.8037.98, macOS arm64.
- `npm run typecheck`: **PASS**
- `npm test`: **PASS — 6 files, 65 tests**
- `npm run build:package`: **PASS**
- `npm run build`: **PASS — 10 HTML entries**
- `npm run test:smoke`: **PASS — 16/16**
- `npm run test:oracle`: **PASS — 2,400 updates**
- `npm run bench:all`: **PASS — reactive and compat benchmark suites**
- `npm run test:browser`: **PASS — Counter, runtime smoke, and full Todo browser flow**
- `npm run test:consumer`: **PASS — separate strict TypeScript consumer**
- React/Preact behavioral parity: **NOT CLAIMED**

## Remaining release gaps

- Focus/caret coverage targets keyed input moves; broader form and cross-browser matrix remain to be added.
- Effects execute immediately after DOM commit; batching, concurrent scheduling, context, reducer, portals, SSR, and full SVG semantics remain out of scope.
- DOM/SVG props and events do not fully match React/Preact.

See [ROADMAP](../ROADMAP.md), [Compatibility](COMPATIBILITY.md), and [TESTING](TESTING.md).
