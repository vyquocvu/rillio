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

The automatic JSX runtimes provide checked intrinsic tags, common HTML/SVG props, `aria-*`/`data-*`, style records, and element-specific `currentTarget` types for common events. Unknown attributes fail typechecking; applications can add custom elements by augmenting the exported `JSX.IntrinsicElements`. This is a practical baseline, not complete DOM/SVG typings.

`createRoot(container)` returns `{ render(value), unmount() }`. `render(value, container)` reuses the addressable root for that container. A container may have only one live root across the JSX and explicit reactive APIs; creating another root throws `ZUI_ROOT_OCCUPIED` instead of silently replacing the existing tree.

## UI primitives

`zui/ui` is an optional visual layer on top of the runtime. It exports `tokens`, `uiStyles`, `StyleSheet`, and composable primitives: `Button`, `IconButton`, `Badge`, `Avatar`, `Card`, `Field`, `Input`, `Progress`, `Modal`, `Stack`, `Inline`, and `EmptyState`.

Mount `<StyleSheet />` once near the application root. `Input` creates an id when needed and associates labels, hints, and errors with the control. `Progress` requires an accessible `label` and clamps its ARIA value to the advertised range. The primitives use ordinary ZUI VNodes, so their children, event handlers, refs, controlled values, and lifecycle follow the same Flat Index and PatchEngine contract as application JSX.

`Modal` associates each dialog with a unique accessible title, focuses its first control, traps Tab navigation, closes on Escape or backdrop click, and restores focus to the previously focused element when dismissed. With multiple dialogs, keyboard handling is limited to the topmost dialog.

## Hooks

The current component hooks are:

- `useState(initial)` — snapshot state; a changed setter schedules synchronous component reconciliation.
- `useEffect(effect, deps?)` — dependency-aware effect with cleanup, flushed after the root transaction.
- `useMemo(calculate, deps?)` — ordered memo slot.
- `useCallback(fn, deps?)` — memoized callback slot.
- `useRef(initial)` — stable mutable ref slot.

Hook ordering is checked. State writes during component evaluation throw `ZUI_RENDER_PHASE_UPDATE`; updates after disposal are ignored.

ZUI does not claim React hook scheduling, batching, synthetic event, Context, Suspense, or ecosystem compatibility.

## Zustand integration

`zui/zustand` provides first-class, zero-dependency Zustand integration without importing React. It exports `create`, `createStore`, `useStore`, `shallow`, and `useShallow`:

```tsx
import { create, useShallow } from "zui/zustand";

interface CounterState {
  count: number;
  multiplier: number;
  increment: () => void;
}

// Create a bound store hook with full getState, setState, and subscribe API
const useCounter = create<CounterState>(set => ({
  count: 0,
  multiplier: 2,
  increment: () => set(state => ({ count: state.count + 1 }))
}));

function Counter() {
  // 1. Primitive selection (atomic re-renders):
  const count = useCounter(state => state.count);

  // 2. Object selection with shallow comparison:
  const { total } = useCounter(
    useShallow(state => ({ total: state.count * state.multiplier }))
  );

  return (
    <button onClick={() => useCounter.getState().increment()}>
      Count: {count} (Total: {total})
    </button>
  );
}
```

The adapter also accepts standalone vanilla stores via `create(existingStore)` or `useStore(store, selector, equalityFn)`. When selecting objects or arrays, use `useShallow(selector)` or pass `shallow` as the equality function to prevent redundant re-renders. Do not import `create` or `useStore` from `"zustand"` in ZUI components, as Zustand's default React entry point expects React's `useSyncExternalStore`.

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

`NodeRegistry` exposes stable `NodeId`, `RootId`, and `OwnerId` records, linked parent/sibling structure, ownership, and versions. Disposed records are stripped of DOM/component references and retained as lightweight diagnostics up to `maxTombstones` (default 1,000); older ids become unknown. `nodeRegistry.diagnostics()` returns a `RegistryDiagnostics` snapshot with live counts (`activeNodes`, `tombstoneNodes`, `totalNodes`, `activeOwners`, `tombstoneOwners`, `totalOwners`, `totalRoots`, `maxTombstones`) for continuous leak and lifecycle verification. `PatchEngine` exposes transactional operations for renderer authors. Application code normally uses the JSX or explicit reactive planner rather than calling low-level patch methods.

Full-root consistency verification is opt-in after each transaction to avoid a tree-wide walk in the production update path. Advanced/debug callers can enable it with `new PatchEngine(registry, document, { assertAfterCommit: true })`; `assertAddressableRoot(container)` remains available for an explicit check.

The low-level implementation is also available from `zui/flat`.

## Explicit reactive DOM API

The canonical subpath for the mount-once explicit reactive DOM surface is `zui/dom` (`zui/legacy` remains as a deprecated compatibility alias):

```tsx
import { createStore, select, mount } from "zui/dom";

const count = createStore(0);
mount(() => <button onClick={() => count.set(n => n + 1)}>
  {select(count, value => value)}
</button>, document.getElementById("app")!);
```

Exports include:

- `createStore` — synchronous immutable snapshot store;
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

Renderers must use `PatchEngine` for every browser DOM write. A transaction validates operations before writes, attempts to undo structural/property writes if commit fails, and then disposes removed subtrees. Rollback is best-effort: user ref callbacks and cleanup side effects cannot be made atomic, and cleanup failures may be reported after the DOM commit. Direct `createElement`, `insertBefore`, `remove`, event-listener, attribute, style, and ref writes belong only in `src/flat.ts`.

Any `innerHTML`, `outerHTML`, or `srcdoc` prop is rejected with `ZUI_UNSAFE_HTML_PROP`, including empty values; these sinks can bypass the indexed child tree. String-valued inline event-handler props are rejected with `ZUI_UNSAFE_EVENT_PROP`; use function listeners such as `onClick`. `javascript:`/`vbscript:` URLs and `data:text/html` are rejected with `ZUI_UNSAFE_URL_PROP`. Render untrusted content as text children; ZUI does not sanitize arbitrary application data or CSS.

## Not currently guaranteed

SSR/hydration, portals, async resources, Suspense, full SVG semantics, compiler output, router integration, devtools, broad accessibility/property normalization, and React/Preact drop-in compatibility.
