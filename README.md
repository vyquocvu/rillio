# ZUI

**Experimental store-first frontend library** with TypeScript, JSX, fine-grained subscriptions, mount-once components, and direct DOM updates. No Virtual DOM.

## Run the MVP demo

```sh
npm install
npm run dev
```

Open the Vite URL (default http://127.0.0.1:5173). The demo is `examples/counter.tsx`.

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

List item callbacks capture the item at creation time. To update a field while keeping the same key, use a reactive binding inside the item; a newly supplied object with the same key does not automatically rerun its initializer.

## Status / limitations

This is a **frontend MVP prototype**, not a production-ready framework. It includes DOM bindings, elements, events, a TypeScript JSX runtime, conditional regions, keyed list operations and basic lifecycle disposal.

Not implemented: SSR/hydration, router, suspense, portals, component-scoped context, delegated event system, SVG namespaced elements, production-grade style diffing, Flat Index / addressable patches, and complete security handling for remote-supplied UI. Runtime runs on a single graph engine by default. The Scan/Graph research engine is available separately; preregistered performance studies remain pending.

**No CI/CD is configured by design.** See `research/` for pre-registration, semantics and earlier verification scope.
