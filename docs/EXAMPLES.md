# Examples and benchmarks

ZUI ships a dashboard showcase for the JSX runtime, an external Zustand store adapter, an explicit mount-once reactive DOM surface, and benchmark suites.

| Page / Subpath | Focus |
|---|---|
| `/` or `/admin.html` | ZUI Studio dashboard showcase with responsive layout and interactive team management |
| `/realworld.html` | TaskFlow real-world project management application (Kanban, issues table, analytics, team, settings, Portals, ErrorBoundary, Zustand, DevTools) |
| `/render-lab.html` | Console-traced comparison of local component state, parent state, and external-store selector updates |
| `/store-lab.html` | Atomic and shallow Zustand selectors with visible render logs |
| `/data-lab.html` | Mount-once reactive bindings, keyed list updates, DOM identity, and async resources |
| [`docs/COMPONENT-LIFECYCLE.md`](COMPONENT-LIFECYCLE.md) | 100 logged lifecycle tests and current ZUI/React/Preact/Vue browser comparison |
| `zui/ui` | Reusable visual primitives, tokens, and accessible controls |
| `zui/external-store` | First-class, zero-dependency external stores (`create`, `shallow`, `useShallow`, `useStore`) |
| `zui/dom` | Explicit mount-once reactive DOM API (`createStore`, `select`, `mount`, `Show`, `For`) |
| `zui/devtools` | Live in-browser Flat Index inspector overlay and diagnostics |
| `npm run bench:all` | Node benchmark suites for reactive invalidation, keyed reconciliation, and Flat Index updates |
| `npm run bench:browser` | Headless Playwright Chromium benchmark comparing keyed lists and component updates in ZUI, React, Preact, and Vue |

Open `/demos.html` for a browser-friendly interactive index.

## 1. External Store Integration (`zui/external-store`)

Create bound stores directly without React dependencies, and select slices with atomic or shallow comparison:

```tsx
import { create, useShallow } from "zui/external-store";
import { createRoot } from "zui";

interface CartState {
  items: string[];
  discount: number;
  addItem: (item: string) => void;
  setDiscount: (discount: number) => void;
}

// 1. Create a bound store hook with full getState, setState, and subscribe methods
export const useCart = create<CartState>(set => ({
  items: ["MacBook Pro", "Magic Trackpad"],
  discount: 10,
  addItem: item => set(state => ({ items: [...state.items, item] })),
  setDiscount: discount => set({ discount })
}));

// 2. Atomic selection: only re-renders when item count changes
function CartBadge() {
  const count = useCart(state => state.items.length);
  return <span class="badge">{count} items</span>;
}

// 3. Multi-field selection: useShallow prevents re-renders when other fields change
function CartSummary() {
  const { count, discount } = useCart(
    useShallow(state => ({
      count: state.items.length,
      discount: state.discount
    }))
  );

  return (
    <div>
      <p>Items: {count} (Discount: {discount}%)</p>
      <button onClick={() => useCart.getState().addItem("USB-C Hub")}>
        Add Hub
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <main>
    <CartBadge />
    <CartSummary />
  </main>
);
```

## 2. Explicit Reactive DOM (`zui/dom`)

Mount-once reactive DOM API without component re-evaluation:

```tsx
import { createStore, select, mount, Show, For } from "zui/dom";

const store = createStore({
  count: 0,
  visible: true,
  todos: [{ id: 1, text: "Explore ZUI" }]
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

## 3. Real-World Application Showcase (`/realworld.html`)

The TaskFlow application under `examples/realworld/` showcases a complete, production-grade workspace built with ZUI:

- **State Management (`zui/external-store`)**: Centralized store with atomic selection for filters, active project, search query, modals, theme toggling, and toasts.
- **Portals (`createPortal`)**: Floating toast notification manager mounted directly to `document.body`, and an accessible task creation/editing modal dialog with backdrop dismiss and escape handling.
- **Error Boundaries (`ErrorBoundary`)**: Subtree resilience leveraging transactional savepoints (`savepoint()` / `rollbackTo()`) to catch and recover from isolated render failures without crashing parent layouts.
- **DevTools HUD (`zui/devtools`)**: Embedded Flat Index inspector overlay displaying real-time `NodeId`, `Kind`, `OwnerId`, and transaction diagnostics.
- **Rich Interactive Views**:
  - **Kanban Board**: Drag-and-drop-style status progression across Backlog, Todo, In Progress, In Review, and Done.
  - **Issues Table**: Multi-column data grid with status, priority, assignee, tag filters, and sorting.
  - **Workspace Analytics**: Progress tracking, priority distribution metrics, and live activity audit logs.
  - **Team Directory**: Member workloads, assigned task meters, and role definitions.
  - **Settings**: Theme persistence, mock database reset, and interactive ErrorBoundary recovery testing.

Run `npm run dev` and navigate to `http://localhost:5173/realworld.html` or select **TaskFlow Workspace** from `/demos.html`.

## 4. Render, Store, and Data Labs

These small diagnostic pages are designed for the browser console. Each writes component or data events with a distinct prefix so you can connect a click to the work ZUI performs:

- **Render Scope Lab (`/render-lab.html`)**: Compare a local `useState` update, an App-owned update, and a Zustand slice update. Look for `[render-lab]` entries.
- **Store Selector Lab (`/store-lab.html`)**: Update one selected field at a time and compare atomic selectors with a shallow object selector. Look for `[store-lab]` entries.
- **Reactive Data Lab (`/data-lab.html`)**: Add/edit/reorder keyed rows and refetch an async resource. Row creation, row data updates, and resource status use `[data-lab]` entries.

The log lines count component function calls or explicit data events. They do not imply that an existing DOM element was replaced; the browser smoke flow also checks element identity where it matters.

## 5. Benchmarks

```sh
# Synchronous browser benchmark vs React, Preact, Vue (Playwright Chromium)
npm run bench:browser

# Node microbenchmarks
npm run bench:reactive
npm run bench:compat
npm run bench:flat
npm run bench:all
```
