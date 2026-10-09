# Architecture

## Overview

```text
TSX / JSX authoring
   -> zui/jsx-runtime (jsx, jsxs, Fragment)
   -> VNode descriptors + Show/For region descriptors
   -> mount() / renderChild() (one-time component invocation)
   -> DOM Nodes + per-property bindings
   -> reactive engine (store, computed, effect, batch, owner)
```

ZUI currently has **no Virtual DOM diff loop**. JSX produces descriptors during initial mount; subsequent state changes execute subscribed effects and mutate DOM nodes. The browser DOM remains a tree; this does not mean ZUI has already implemented a Flat Index.

## Current files

- `src/reactive.ts`: Store/Computed/effect, scan vs graph invalidation modes, batching, owners and diagnostics.
- `src/dom.ts`: graph-engine-backed frontend API, binding descriptors, JSX renderer, Show/For regions, props, DOM disposal.
- `src/jsx-runtime.ts`, `src/jsx-dev-runtime.ts`: automatic JSX transform entries.
- `examples/counter.tsx`, `examples/todo.tsx`: integration demos.
- `tests/`: reactive conformance, oracle/fuzz, DOM regressions and smoke runners.

## Dataflow and lifecycle

`createStore` creates an observable snapshot. `select(store, selector)` and `derive(read)` defer reads until a binding effect executes. At initial mount `renderChild` installs effects for dynamic text/props; event callbacks write stores; a flush updates only affected bindings in graph mode.

Owner scopes dispose effects and nested scopes. `mount` returns a disposer. Conditional branches have anchor comments and replace their owned subtree when visibility changes. Keyed lists have per-key anchor ranges and a latest-item accessor `current()`: keys preserve node identity while reactive fields can update. Replacing data with the same key does **not** rerun arbitrary item initializer code.

## Scheduler contract (current intended semantics)

- Store writes update synchronously; `Object.is` equality suppresses no-op writes.
- `batch()` flushes after the outer batch.
- Writes triggered from effects go through later flush rounds instead of direct recursive execution; runaway cycles are bounded.
- Computed reads must be pure; writes during computed evaluation throw.
- Correctness of nested mutation, owner cleanup and exception recovery still needs complete browser tests. See `docs/TESTING.md`.

## Design constraints

1. Mount-once means ordinary JS values evaluated once are **not** reactive. Use `select` or `derive` and explicit `Show`/`For`.
2. Do not silently add VDOM reconciliation for state updates.
3. Avoid DOM mutations after dispose; disposed owners must not retain effects.
4. Prefer stable keys to positional identity; dynamic items can carry reactive `current()`.
5. One DOM property should have one authoritative writer in any future agent patch layer.
6. Default singleton graph engine is an MVP limitation; root isolation requires a deliberate design before SSR/concurrent apps.

## Risks and decisions pending

- Reactive engine and DOM owner interactions may leak effects when regions are replaced.
- Fine-grained updates inside list reconciliation must avoid re-entrant structural mutations.
- Intrinsic JSX typing currently permits broad `any`; improve before packaging.
- Styling/attributes need careful HTML/SVG and security semantics.
- Flat Index and patch protocol are **research extensions**, not prerequisites for the frontend core.
