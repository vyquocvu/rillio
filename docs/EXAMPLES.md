# Examples and benchmarks

ZUI ships a dashboard showcase for the JSX runtime, an external Zustand store adapter, an explicit mount-once reactive DOM surface, and benchmark suites.

| Page / Subpath | Focus |
|---|---|
| `/` or `/admin.html` | ZUI Studio dashboard showcase with responsive layout and interactive team management |
| `zui/ui` | Reusable visual primitives, tokens, and accessible controls |
| `zui/zustand` | First-class, zero-dependency Zustand stores (`create`, `shallow`, `useShallow`, `useStore`) |
| `zui/dom` | Explicit mount-once reactive DOM API (`createStore`, `select`, `mount`, `Show`, `For`) |
| `npm run bench:all` | Node benchmark suites for reactive invalidation, keyed reconciliation, and Flat Index updates |
| `npm run bench:browser` | Headless Playwright Chromium benchmark comparing ZUI, React, Preact, and Vue |

Open `/demos.html` for a browser-friendly interactive index.

## 1. Zustand Integration (`zui/zustand`)

Create bound stores directly without React dependencies, and select slices with atomic or shallow comparison:

```tsx
import { create, useShallow } from "zui/zustand";
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

## 3. Benchmarks

```sh
# Synchronous browser benchmark vs React, Preact, Vue (Playwright Chromium)
npm run bench:browser

# Node microbenchmarks
npm run bench:reactive
npm run bench:compat
npm run bench:flat
npm run bench:all
```
