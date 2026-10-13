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

Use the optional `zui/zustand` adapter to read a Zustand vanilla store or a bound store created with `create`. It follows Zustand's Store API structurally, so the ZUI runtime does not import Zustand or React:

```tsx
import { createStore } from "zustand/vanilla";
import { useStore } from "zui/zustand";

const counter = createStore<{ count: number; increment: () => void }>()(set => ({
  count: 0,
  increment: () => set(state => ({ count: state.count + 1 }))
}));

function Counter() {
  const count = useStore(counter, state => state.count);
  return <button onClick={() => counter.getState().increment()}>{count}</button>;
}
```

The adapter accepts Zustand's `getState()` and `subscribe()` API, subscribes after mount, and unsubscribes with the ZUI component lifecycle. A component rerenders only when its selected value changes by `Object.is`; pass a third equality function for tuple/object selections. Zustand's own `useStore` is a React Hook and should not be called inside ZUI components; use this adapter instead. This does not add Zustand as a runtime dependency, and ZUI still does not provide SSR/hydration.

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

`NodeRegistry` exposes stable `NodeId`, `RootId`, and `OwnerId` records, linked parent/sibling structure, ownership, and versions. Disposed records are stripped of DOM/component references and retained as lightweight diagnostics up to `maxTombstones` (default 1,000); older ids become unknown. `PatchEngine` exposes transactional operations for renderer authors. Application code normally uses the JSX or explicit reactive planner rather than calling low-level patch methods.

Full-root consistency verification is opt-in after each transaction to avoid a tree-wide walk in the production update path. Advanced/debug callers can enable it with `new PatchEngine(registry, document, { assertAfterCommit: true })`; `assertAddressableRoot(container)` remains available for an explicit check.

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

Renderers must use `PatchEngine` for every browser DOM write. A transaction validates operations before writes, attempts to undo structural/property writes if commit fails, and then disposes removed subtrees. Rollback is best-effort: user ref callbacks and cleanup side effects cannot be made atomic, and cleanup failures may be reported after the DOM commit. Direct `createElement`, `insertBefore`, `remove`, event-listener, attribute, style, and ref writes belong only in `src/flat.ts`.

Any `innerHTML`, `outerHTML`, or `srcdoc` prop is rejected with `ZUI_UNSAFE_HTML_PROP`, including empty values; these sinks can bypass the indexed child tree. String-valued inline event-handler props are rejected with `ZUI_UNSAFE_EVENT_PROP`; use function listeners such as `onClick`. `javascript:`/`vbscript:` URLs and `data:text/html` are rejected with `ZUI_UNSAFE_URL_PROP`. Render untrusted content as text children; ZUI does not sanitize arbitrary application data or CSS.

## Not currently guaranteed

SSR/hydration, portals, async resources, Suspense, full SVG semantics, compiler output, router integration, devtools, broad accessibility/property normalization, and React/Preact drop-in compatibility.
