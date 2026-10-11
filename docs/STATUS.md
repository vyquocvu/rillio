# ZUI Status — Flat Index migration

Updated: 2026-10-11. Code verification revision: `0758bbf` (`fix: validate and finalize flat transactions`). Documentation changes after that revision do not change runtime code.

## Implemented

- `NodeRegistry` assigns monotonic `NodeId`, `RootId`, and `OwnerId` values and tracks linked parent/sibling structure, ownership, and versions.
- `PatchEngine` is the only production module that mutates browser DOM nodes.
- Transactions validate operations, commit structural/property changes, then dispose removed subtrees.
- The JSX runtime uses registry node ids instead of an authoritative `Instance` tree.
- The explicit reactive surface uses the same registry, patch engine, and owner host.
- Hooks, conditional rendering, fragments, arrays, keyed `.map()`, `Show`, `For`, refs, controlled values, focus, and caret behavior remain covered.
- Seeded randomized consistency tests compare DOM order, registry order, keys, and stable node identity.
- Lifecycle tests cover repeated component disposal and reactive branch disposal.
- Package exports include the flat implementation through `zui/flat`; generated ESM and declarations remain supported.
- `bench:flat` measures the addressable runtime from generated package artifacts and emits raw local JSON without a performance claim.

## Verification

Environment recorded for this run: Node v26.5.0, npm 12.0.2, TypeScript 5.9.3, Vitest 5.0.3, Vite 6.4.4, Chrome 154.0.8037.98, macOS arm64.

- `npm run typecheck`: **PASS**
- `npm test`: **PASS — 9 files, 71 tests**
- `npm run build:package`: **PASS**
- `npm run build`: **PASS — 10 HTML entries**
- `npm run test:smoke`: **PASS — 16/16**
- `npm run test:oracle`: **PASS — 2,400 updates**
- `npm run bench:all`: **PASS — reactive, keyed, and flat-index suites; raw local JSON emitted**
- `npm run test:browser`: **PASS — Counter, browser smoke, and Todo flows**
- `npm run test:consumer`: **PASS — separate strict TypeScript consumer**
- React/Preact behavioral parity: **NOT CLAIMED**

The flat-index benchmark emitted average update times of 1.7147 ms (100 rows / 50 iterations), 50.3496 ms (1,000 / 20), and 175.8921 ms (2,000 / 5) in this local run. These are reproducibility evidence for this environment, not a cross-framework or release performance claim.

The browser test required permission to bind the local preview port; the sandbox-only attempt failed with `listen EPERM`, and the approved external run passed.

## Remaining release gaps

- Failed-update rollback does not yet snapshot all renderer metadata and component state; this is the next hardening milestone.
- SVG namespaces, form/property normalization, custom elements, accessibility-oriented properties, and strong JSX intrinsic types need broader coverage.
- SSR/hydration, portals, async resources, compiler optimization, devtools, and router/data-layer integrations remain out of scope.
- The registry retains disposed tombstones for diagnostics; memory-retention diagnostics and compaction policy are not yet defined.

See [the roadmap](../ROADMAP.md), [the architecture](ARCHITECTURE.md), [the API contract](API.md), and [testing](TESTING.md).
