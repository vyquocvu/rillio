# ZUI API — experimental v0.1

ZUI uses standard JSX syntax through `jsxImportSource: "zui"`, but its runtime semantics are ZUI-owned. The Flat Index and Patch Engine are the implementation contract behind both public rendering surfaces.

## JSX runtime

```tsx
import { createRoot, useState, useEffect } from "zui";

function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = String(count);
  }, [count]);
  return <button onClick={() => setCount(n => n + 1)}>{count}</button>;
}

createRoot(document.getElementById("app")!).render(<Counter />);
```

Supported JSX output includes:

- intrinsic elements and function components;
- text, fragments, arrays, `null`, booleans, and numbers;
- ordinary `&&`/ternary conditional expressions;
- keyed `.map()` output;
- refs, events, class/style, controlled `value`/`checked`/`disabled`, and basic DOM properties.

`createRoot(container)` returns `{ render(value), unmount() }`. `render(value, container)` reuses the addressable root for that container.

## Hooks

The current component hooks are:

- `useState(initial)` — snapshot state; a changed setter schedules synchronous component reconciliation.
- `useEffect(effect, deps?)` — dependency-aware effect with cleanup, flushed after the root transaction.
- `useMemo(calculate, deps?)` — ordered memo slot.
- `useCallback(fn, deps?)` — memoized callback slot.
- `useRef(initial)` — stable mutable ref slot.

Hook ordering is checked. State writes during component evaluation throw `ZUI_RENDER_PHASE_UPDATE`; updates after disposal are ignored.

ZUI does not claim React hook scheduling, batching, synthetic event, Context, Suspense, or ecosystem compatibility.

## Addressable DOM API

The root export includes:

```ts
import {
  NodeRegistry,
  PatchEngine,
  nodeRegistry,
  patchEngine
} from "zui";
```

`NodeRegistry` exposes stable `NodeId`, `RootId`, and `OwnerId` records, linked parent/sibling structure, ownership, and versions. `PatchEngine` exposes transactional operations for renderer authors. Application code normally uses the JSX or explicit reactive planner rather than calling low-level patch methods.

The low-level implementation is also available from `zui/flat`.

## Explicit reactive API

The `zui/legacy` subpath is a compatibility alias for the explicit reactive surface:

```tsx
import { createStore, select, mount } from "zui/legacy";

const count = createStore(0);
mount(() => <button onClick={() => count.set(n => n + 1)}>
  {select(count, value => value)}
</button>, document.getElementById("app")!);
```

Exports include:

- `createStore`, `useStore` — synchronous immutable snapshot store;
- `select(store, selector)` — deferred binding descriptor;
- `derive(read)` — deferred binding descriptor;
- `computed`, `batch`, `untrack`;
- `mount`, `Show`, and `For`.

`Show` owns a conditional boundary. `For` requires stable unique keys and preserves the boundary `NodeId` for an item while its position or current value changes.

```tsx
<Show when={select(state, value => value.visible)} fallback={<p>Hidden</p>}>
  <p>Visible</p>
</Show>

<For each={select(state, value => value.items)} by={item => item.id}>
  {(initialItem, current) => <li>{derive(() => current().title)}</li>}
</For>
```

Ordinary `store.get()` reads during mount are snapshots. Use a binding or a reactive region for live DOM updates.

## Reactive engine

`zui/reactive` exposes the standalone `ReactiveEngine` used by the explicit runtime:

```ts
import { createEngine } from "zui/reactive";

const engine = createEngine("graph");
const state = engine.createStore(0);
const stop = engine.effect(() => console.log(state.get()));
state.set(1);
stop();
```

The graph engine tracks dependencies, batches writes, bounds flush rounds, rejects computed writes, and supports an `OwnerHost`. The DOM runtime passes `NodeRegistry` as that host so DOM and reactive ownership share `OwnerId` values.

## Mutation and lifecycle contract

Renderers must use `PatchEngine` for every browser DOM write. A transaction validates operations, commits structural/property changes, and then disposes removed subtrees. Direct `createElement`, `insertBefore`, `remove`, event-listener, attribute, style, and ref writes belong only in `src/flat.ts`.

## Not currently guaranteed

SSR/hydration, portals, async resources, Suspense, full SVG semantics, compiler output, router integration, devtools, broad accessibility/property normalization, and React/Preact drop-in compatibility.
