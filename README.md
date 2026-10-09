# ZUI

**Experimental store-first frontend library** with TypeScript, JSX, fine-grained subscriptions, mount-once components, and direct DOM updates. No Virtual DOM.

## Project documentation

- [Roadmap](ROADMAP.md) — frontend milestones, MVP release gates, separate research track
- [Architecture](docs/ARCHITECTURE.md) — reactive dataflow, DOM runtime, lifecycle and tradeoffs
- [API guide](docs/API.md) — current TypeScript/JSX interface and examples
- [Testing and acceptance](docs/TESTING.md) — required checks and regression scenarios
- [Status and verification](docs/STATUS.md) — evidence-based implementation/verification state
- [Contributing](CONTRIBUTING.md) — development conventions and documentation discipline
- [Research preregistration](research/preregistration.md) — frozen benchmark protocol

**MVP status:** implementation present; frontend typecheck, full tests, build and consumer package gates still need independent verification.

## React-friendly authoring (experimental)

`useStore(initial)` offers familiar naming but returns a **live store**, not React's `[value, setter]` tuple. Use `{store}` for reactive text, `value={store}` for reactive DOM properties, and `{() => store.get().visible ? <Panel /> : null}` for reactive conditional regions. These function regions currently remount on dependency updates; `<For>` remains necessary for stable keyed lists. Automatic reactive `.map()` JSX requires future compiler work. See [API](docs/API.md).

## Run the MVP demo

```sh
npm install
npm run dev
```

Open the Vite URL (default http://127.0.0.1:5173). The Counter demo is `examples/counter.tsx` at `/`, and the Todo demo is `examples/todo.tsx` at `/todo.html`.

```sh
npm run typecheck
npm test
npm run build
```

The test suite uses Vitest and jsdom. Research runners are retained as `npm run test:smoke`, `npm run test:oracle`, and `npm run bench:smoke`.

## Minimal example

```tsx
import { createStore, select, mount, Show, For } from "zui";

const state = createStore({ count: 0, visible: true, items: [{ id: "a", label: "First" }] });

function App() {
  return <main>
    <h1>Count: {select(state, s => s.count)}</h1>
    <button onClick={() => state.set(s => ({ ...s, count: s.count + 1 }))}>Increment</button>
    <Show when={select(state, s => s.visible)}>
      {() => <p>Visible!</p>}
    </Show>
    <ul><For each={select(state, s => s.items)} by={item => item.id}>
      {item => <li>{item.label}</li>}
    </For></ul>
  </main>;
}

mount(App, document.getElementById("app")!);
```

JSX uses `jsx: "react-jsx"` and `jsxImportSource: "zui"`; it does **not** import React.

### API overview

- `createStore(initial)`: reactive state; `get()`, `set(value | updater)`.
- `select(store, selector)`: reactive binding descriptor (text or element property).
- `derive(read)`: reactive binding from a tracked read function.
- `computed(read)`, `batch(fn)`: derived values and batched updates.
- `mount(component, target)`: creates UI once; returns disposal function.
- `<Show when={...}>{() => ...}</Show>`: mount/unmount conditional content.
- `<For each={...} by={item => item.id}>{item => ...}</For>`: keyed list regions; reorder preserves DOM identity.

List item callbacks mount once per key. The second callback argument `current()` reads the latest item for that key, so `derive(() => current().title)` updates displayed fields without replacing the DOM node. The first argument is the item from initial mount; use `current()` for changing fields.

## Status / limitations

This is a **frontend MVP prototype**, not a production-ready framework. It includes DOM bindings, elements, events, a TypeScript JSX runtime, conditional regions, keyed list operations and basic lifecycle disposal.

Not implemented: SSR/hydration, router, suspense, portals, component-scoped context, delegated event system, SVG namespaced elements, full CSS and SVG support, Flat Index / addressable patches, and complete security handling for remote-supplied UI. Runtime runs on a single graph engine by default. The Scan/Graph research engine is available separately; preregistered performance studies remain pending.

**No CI/CD is configured by design.** See `research/` for pre-registration, semantics and earlier verification scope.
