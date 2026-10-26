# Rillio API — experimental v0.1

Rillio uses standard JSX syntax through `jsxImportSource: "rillio"`, but its runtime semantics are Rillio-owned. The Flat Index and Patch Engine are the implementation contract behind both public rendering surfaces.

## JSX runtime

```tsx
import { createRoot, useState, useEffect } from "rillio";

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

`createRoot(container)` returns `{ render(value), unmount() }`. `render(value, container)` reuses the addressable root for that container. A container may have only one live root across the JSX and explicit reactive APIs; creating another root throws `RILLIO_ROOT_OCCUPIED` instead of silently replacing the existing tree.

## Hooks

The current component hooks are:

- `useState(initial)` — snapshot state; a changed setter schedules synchronous component reconciliation.
- `useEffect(effect, deps?)` — dependency-aware effect with cleanup, flushed after the root transaction.
- `useMemo(calculate, deps?)` — ordered memo slot.
- `useCallback(fn, deps?)` — memoized callback slot.
- `useRef(initial)` — stable mutable ref slot.

Hook ordering is checked. State writes during component evaluation throw `RILLIO_RENDER_PHASE_UPDATE`; updates after disposal are ignored.

Rillio does not claim React hook scheduling, batching, synthetic event, Context, Suspense, or ecosystem compatibility.

## Flat Index and diagnostics

The `rillio` root entry is reserved for the JSX runtime API. Import Flat Index constructors from `rillio/flat`, and shared runtime diagnostics from `rillio/devtools`:

```ts
import { NodeRegistry, PatchEngine } from "rillio/flat";
import { nodeRegistry, patchEngine, assertAddressableRoot } from "rillio/devtools";
```

`NodeRegistry` exposes stable `NodeId`, `RootId`, and `OwnerId` records, linked parent/sibling structure, ownership, and versions. Disposed records are stripped of DOM/component references and retained as lightweight diagnostics up to `maxTombstones` (default 1,000); older ids become unknown. `nodeRegistry.diagnostics()` returns a `RegistryDiagnostics` snapshot with live counts (`activeNodes`, `tombstoneNodes`, `totalNodes`, `activeOwners`, `tombstoneOwners`, `totalOwners`, `totalRoots`, `maxTombstones`) for continuous leak and lifecycle verification. `PatchEngine` exposes transactional operations for renderer authors. Application code normally uses the JSX or explicit reactive planner rather than calling low-level patch methods.

Full-root consistency verification is opt-in after each transaction to avoid a tree-wide walk in the production update path. Advanced/debug callers can enable it with `new PatchEngine(registry, document, { assertAfterCommit: true })`; `assertAddressableRoot(container)` is available from `rillio/devtools` for an explicit check. `getAddressableRoot(container)` is also available there when callers need the root handle.

## Explicit reactive DOM API

The subpath for the mount-once explicit reactive DOM surface is `rillio/dom`:

```tsx
import { createStore } from "rillio/reactive";
import { select, mount } from "rillio/dom";

const count = createStore(0);
mount(() => <button onClick={() => count.set(n => n + 1)}>
  {select(count, value => value)}
</button>, document.getElementById("app")!);
```

`rillio/reactive` exports the shared reactive engine and store primitives, including `createStore`, `computed`, `batch`, and `untrack`. `rillio/dom` exports:

- `select(store, selector)` — deferred binding descriptor;
- `derive(read)` — deferred binding descriptor;
- `resource(fetcher, options)` — asynchronous resource store (`.loading`, `.data`, `.error`, `.status`, `.mutate()`, `.refetch()`);
- `mount`, `Show`, and `For`.

The same reactive engine backs both subpaths, so stores created through `rillio/reactive` can be consumed by bindings in `rillio/dom`. The DOM subpath intentionally owns rendering and bindings, while the reactive subpath owns store creation and computation APIs.

`Show` owns a conditional boundary. `For` requires stable unique keys and preserves the boundary `NodeId` for an item while its position or current value changes.

```tsx
<Show when={user.loading} fallback={<p>Loaded: {user.data}</p>}>
  <p>Loading...</p>
</Show>

<For each={select(state, value => value.items)} by={item => item.id}>
  {(initialItem, current) => <li>{derive(() => current().title)}</li>}
</For>
```

Ordinary `store.get()` reads during mount are snapshots. Use a binding or a reactive region for live DOM updates.

## DevTools and Flat Index inspection

`rillio/devtools` exposes real-time inspection, node range highlighting, transaction tracking, and an in-browser HUD overlay:

```ts
import { inspectRoot, highlightNode, trackTransactions, createInspectorOverlay } from "rillio/devtools";

// Inspect serialized node hierarchy
const snapshot = inspectRoot(document.getElementById("app")!);

// Track live transactions with duration and operation details
const tracker = trackTransactions();

// Mount floating dark-mode diagnostic HUD directly in browser
const overlay = createInspectorOverlay({ targetRoot: document.getElementById("app")! });
```

## Reactive engine

`rillio/reactive` exposes the standalone `ReactiveEngine` used by the explicit runtime:

```ts
import { createEngine } from "rillio/reactive";

const engine = createEngine("graph");
const state = engine.createStore(0);
const stop = engine.effect(() => console.log(state.get()));
state.set(1);
stop();
```

The graph engine tracks dependencies, batches writes, bounds flush rounds, rejects computed writes, and supports an `OwnerHost`. The DOM runtime passes `NodeRegistry` as that host so DOM and reactive ownership share `OwnerId` values.

## Mutation and lifecycle contract

Renderers must use `PatchEngine` for every browser DOM write. A transaction validates operations before writes, attempts to undo structural/property writes if commit fails, and then disposes removed subtrees. Rollback is best-effort: user ref callbacks and cleanup side effects cannot be made atomic, and cleanup failures may be reported after the DOM commit. Direct `createElement`, `insertBefore`, `remove`, event-listener, attribute, style, and ref writes belong only in `src/flat/`.

Any `innerHTML`, `outerHTML`, or `srcdoc` prop is rejected with `RILLIO_UNSAFE_HTML_PROP`, including empty values; these sinks can bypass the indexed child tree. String-valued inline event-handler props are rejected with `RILLIO_UNSAFE_EVENT_PROP`; use function listeners such as `onClick`. `javascript:`/`vbscript:` URLs and `data:text/html` are rejected with `RILLIO_UNSAFE_URL_PROP`. Render untrusted content as text children; Rillio does not sanitize arbitrary application data or CSS.

## Not currently guaranteed

SSR/hydration, full SVG semantics, compiler output, router integration, broad accessibility/property normalization, and React/Preact drop-in compatibility.
