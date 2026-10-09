# ZUI Frontend API — experimental v0.1

This describes the **current source API**, not a stable published NPM release.

## Install/run source demo

```sh
npm install
npm run dev
```

Use `jsx: "react-jsx"`, `jsxImportSource: "zui"` for TSX. Current self-referencing exports point at source `.ts` and need modern tooling; packaged JS/types are pending M4.

## Reactive primitives

```ts
import { createStore, select, derive, computed, batch } from "zui";
const tasks = createStore([{ id: 1, title: "First" }]);
const count = computed(() => tasks.get().length);
const title = select(tasks, s => s[0]?.title ?? "");
const length = derive(() => count.get());
batch(() => tasks.set(s => [...s, { id: 2, title: "Next" }]));
```

- `store.get()` returns latest snapshot; `store.set(next | updater)` updates synchronously. Use **immutable** updates; mutating the same object and setting it again will be ignored by `Object.is`.
- `select` and `derive` return **binding descriptors**, not immediate display values. Bind them to child text and element properties.
- `computed` caches derivations and must not write state during evaluation.
- `batch` combines write notifications until transaction exit; it does not roll back store writes on exception.

## Components and mounting

```tsx
import { mount, createStore, select } from "zui";
const state = createStore(0);
function Counter() {
  return <button onClick={() => state.set(n => n + 1)}>
    Count: {select(state, n => n)}
  </button>;
}
const dispose = mount(Counter, document.getElementById("app")!);
// dispose() unmounts and cleans bindings.
```

A component is invoked on **mount**, not rerun on state change. Destructured or ordinary static props are not implicitly live.

## Structural regions

```tsx
<Show when={select(state, s => s.visible)} fallback={() => <p>Hidden</p>}>
  {() => <section>Visible</section>}
</Show>

<For each={select(state, s => s.items)} by={item => item.id}>
  {(initialItem, current) => <li>{derive(() => current().title)}</li>}
</For>
```

- `Show` takes a reactive `when` to mount/dispose a branch; use a child **function** for delayed JSX creation.
- `For` requires stable, unique keys. `initialItem` is fixed at first mount for that key, while `current()` returns latest data and can be used in a reactive binding. Duplicate keys throw `ZUI_DUPLICATE_KEY`.
- Event props are `onClick`, `onInput`, etc. Controlled inputs bind `value`/`checked` to reactive descriptors and use event handlers to update state.

## Unsupported or not guaranteed

SSR/hydration, portals, context, router, SVG parity, complex CSS normalization, external untrusted JSX/props, React hooks, implicit JSX reactivity, and production-grade library packaging. No official compatibility or performance claim against React/Solid.
