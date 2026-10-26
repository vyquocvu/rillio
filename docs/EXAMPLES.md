# Examples and benchmarks

Rillio ships a dashboard showcase for the JSX runtime, an explicit mount-once reactive DOM surface, and benchmark suites.

Install the published package to use these APIs in your own application:

```sh
npm install @vyquocvu/rillio
```

See [Rillio on npm](https://www.npmjs.com/package/@vyquocvu/rillio) for package
details. The browser pages and benchmark commands in this guide run from a
repository checkout.

| Page / Subpath | Focus |
|---|---|
| `/` or `/admin.html` | Rillio Studio dashboard showcase with responsive layout and interactive team management |
| `/realworld.html` | TaskFlow real-world project management application (Kanban, issues table, analytics, team, settings, Portals, ErrorBoundary, app state, DevTools) |
| `/render-lab.html` | Console-traced comparison of local component state, parent state, and store selector updates |
| `/store-lab.html` | Atomic and shallow selectors with visible render logs |
| `/data-lab.html` | Mount-once reactive bindings, keyed list updates, DOM identity, and async resources |
| `/benchmarks.html` | Live browser comparison of keyed-list cases with rendered DOM previews, timing, node counts, and browser usage signals |
| [`docs/COMPONENT-LIFECYCLE.md`](COMPONENT-LIFECYCLE.md) | 100 logged lifecycle tests and current Rillio/React/Preact/Vue browser comparison |
| `@vyquocvu/rillio/reactive` + `@vyquocvu/rillio/dom` | Reactive stores (`createStore`) with the explicit mount-once DOM API (`select`, `mount`, `Show`, `For`) |
| `@vyquocvu/rillio/devtools` | Live in-browser Flat Index inspector overlay and diagnostics |
| `npm run bench:all` | Node benchmark suites for reactive invalidation, keyed reconciliation, and Flat Index updates |
| `npm run bench:browser` | Headless Playwright Chromium benchmark comparing keyed lists and component updates in Rillio, React, Preact, and Vue |

Open `/demos.html` for a browser-friendly interactive index.

The [Live Renderer Bench](../benchmarks.html) runs real DOM workloads in the current tab. All six keyed-list cases are visible on the page and can run individually or as a complete suite; set the row count, warmups, and samples to compare Rillio, React, Preact, and Vue. It reports median and P95 time, tree-build and renderer/layout phases, rendered node counts, and available page-level browser usage signals. It checks the resulting row order and text before marking a run passed. Heap is a page-wide Chromium estimate where exposed, not a per-framework allocation measurement.

## 1. Explicit Reactive DOM (`@vyquocvu/rillio/dom`)

Mount-once reactive DOM API without component re-evaluation:

```tsx
import { createStore } from "@vyquocvu/rillio/reactive";
import { select, mount, Show, For } from "@vyquocvu/rillio/dom";

const store = createStore({
  count: 0,
  visible: true,
  todos: [{ id: 1, text: "Explore Rillio" }]
});

function App() {
  return (
    <main>
      <h1>Counter: {select(store, s => s.count)}</h1>
      <button onClick={() => store.set(s => ({ ...s, count: s.count + 1 }))}>
        Increment
      </button>

      <Show when={select(store, s => s.visible)}>
        {() => <p>Branch is visible</p>}
      </Show>

      <ul>
        <For each={select(store, s => s.todos)} by={item => item.id}>
          {item => <li>{item.text}</li>}
        </For>
      </ul>
    </main>
  );
}

mount(App, document.getElementById("app")!);
```

## 2. Real-World Application Showcase (`/realworld.html`)

The TaskFlow application under `examples/realworld/` showcases a complete, production-grade workspace built with Rillio:

- **State Management**: Centralized app state with atomic selection for filters, active project, search query, modals, theme toggling, and toasts.
- **Portals (`createPortal`)**: Floating toast notification manager mounted directly to `document.body`, and an accessible task creation/editing modal dialog with backdrop dismiss and escape handling.
- **Error Boundaries (`ErrorBoundary`)**: Subtree resilience leveraging transactional savepoints (`savepoint()` / `rollbackTo()`) to catch and recover from isolated render failures without crashing parent layouts.
- **DevTools HUD (`@vyquocvu/rillio/devtools`)**: Embedded Flat Index inspector overlay displaying real-time `NodeId`, `Kind`, `OwnerId`, and transaction diagnostics.
- **Rich Interactive Views**:
  - **Kanban Board**: Drag-and-drop-style status progression across Backlog, Todo, In Progress, In Review, and Done.
  - **Issues Table**: Multi-column data grid with status, priority, assignee, tag filters, and sorting.
  - **Workspace Analytics**: Progress tracking, priority distribution metrics, and live activity audit logs.
  - **Team Directory**: Member workloads, assigned task meters, and role definitions.
  - **Settings**: Theme persistence, mock database reset, and interactive ErrorBoundary recovery testing.

Run `npm run dev` and navigate to `http://localhost:5173/realworld.html` or select **TaskFlow Workspace** from `/demos.html`.

## 3. Render, Store, and Data Labs

These small diagnostic pages are designed for the browser console. Each writes component or data events with a distinct prefix so you can connect a click to the work Rillio performs:

- **Render Scope Lab (`/render-lab.html`)**: Compare a local `useState` update, an App-owned update, and a store slice update. Look for `[render-lab]` entries.
- **Store Selector Lab (`/store-lab.html`)**: Update one selected field at a time and compare atomic selectors with a shallow object selector. Look for `[store-lab]` entries.
- **Reactive Data Lab (`/data-lab.html`)**: Add/edit/reorder keyed rows and refetch an async resource. Row creation, row data updates, and resource status use `[data-lab]` entries.

The log lines count component function calls or explicit data events. They do not imply that an existing DOM element was replaced; the browser smoke flow also checks element identity where it matters.

## 4. Benchmarks

```sh
# Synchronous browser benchmark vs React, Preact, Vue (Playwright Chromium)
npm run bench:browser

# Node microbenchmarks
npm run bench:reactive
npm run bench:compat
npm run bench:flat
npm run bench:all
```
