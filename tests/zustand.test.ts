// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { createRoot, jsx } from "../src/compat.js";
import { useStore, create as createZuiBound, shallow, useShallow, createStore as createZuiStore } from "../src/zustand.js";

interface CounterStore {
  count: number;
  label: string;
  increment: () => void;
  setLabel: (label: string) => void;
}

function makeStore() {
  return createStore<CounterStore>()(subscribeWithSelector(set => ({
    count: 0,
    label: "initial",
    increment: () => set(state => ({ count: state.count + 1 })),
    setLabel: label => set({ label })
  })));
}

describe("Zustand adapter", () => {
  it("selects vanilla-store state and skips updates when the selection is equal", () => {
    const store = makeStore();
    const container = document.createElement("div");
    const root = createRoot(container);
    let renders = 0;

    function Counter() {
      const count = useStore(store, state => state.count);
      renders++;
      return jsx("output", { children: count });
    }

    root.render(jsx(Counter, {}));
    expect(container.textContent).toBe("0");
    expect(renders).toBe(1);

    store.getState().setLabel("unrelated");
    expect(container.textContent).toBe("0");
    expect(renders).toBe(1);

    store.getState().increment();
    expect(container.textContent).toBe("1");
    expect(renders).toBe(2);
    root.unmount();
  });

  it("uses a custom equality function for object selections", () => {
    const store = makeStore();
    const container = document.createElement("div");
    const root = createRoot(container);
    let renders = 0;

    function Counter() {
      const selected = useStore(
        store,
        state => ({ count: state.count }),
        (previous, next) => previous.count === next.count
      );
      renders++;
      return jsx("output", { children: selected.count });
    }

    root.render(jsx(Counter, {}));
    store.getState().setLabel("still the same selection");
    expect(renders).toBe(1);
    store.getState().increment();
    expect(container.textContent).toBe("1");
    expect(renders).toBe(2);
    root.unmount();
  });

  it("tracks selector changes and unsubscribes when its component is disposed", () => {
    const store = makeStore();
    const originalSubscribe = store.subscribe;
    const unsubscribe = vi.fn();
    const subscribeSpy = vi.spyOn(store, "subscribe").mockImplementation(listener => {
      const dispose = originalSubscribe(listener);
      return () => {
        unsubscribe();
        dispose();
      };
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    let renders = 0;

    function Field(props: { field: "count" | "label" }) {
      const value = useStore(store, state => state[props.field]);
      renders++;
      return jsx("output", { children: value });
    }

    root.render(jsx(Field, { field: "count" }));
    expect(container.textContent).toBe("0");
    root.render(jsx(Field, { field: "label" }));
    expect(container.textContent).toBe("initial");

    store.getState().increment();
    expect(container.textContent).toBe("initial");
    expect(renders).toBe(2);
    store.getState().setLabel("updated");
    expect(container.textContent).toBe("updated");
    expect(renders).toBe(3);

    root.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    store.getState().setLabel("after unmount");
    expect(renders).toBe(3);
    subscribeSpy.mockRestore();
  });

  it("accepts Zustand's React-bound store without calling its React hook", () => {
    const store = create<CounterStore>()(set => ({
      count: 2,
      label: "bound",
      increment: () => set(state => ({ count: state.count + 1 })),
      setLabel: label => set({ label })
    }));
    const container = document.createElement("div");
    const root = createRoot(container);

    function Counter() {
      return jsx("output", { children: useStore(store, state => state.count) });
    }

    root.render(jsx(Counter, {}));
    expect(container.textContent).toBe("2");
    store.getState().increment();
    expect(container.textContent).toBe("3");
    root.unmount();
  });

  describe("shallow equality helper", () => {
    it("handles primitives, objects, and arrays correctly", () => {
      expect(shallow(1, 1)).toBe(true);
      expect(shallow("a", "a")).toBe(true);
      expect(shallow(true, true)).toBe(true);
      expect(shallow(null, null)).toBe(true);
      expect(shallow(undefined, undefined)).toBe(true);
      expect(shallow(1, 2)).toBe(false);
      expect(shallow(null, {})).toBe(false);
      expect(shallow({}, null)).toBe(false);

      expect(shallow({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
      expect(shallow({ a: 1 }, { a: 2 })).toBe(false);
      expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(shallow({ a: 1, b: 2 }, { a: 1 })).toBe(false);

      expect(shallow([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(shallow([1, 2], [1, 3])).toBe(false);
      expect(shallow([1, 2], [1, 2, 3])).toBe(false);
      expect(shallow([1], { 0: 1 })).toBe(false);
    });
  });

  describe("create and useShallow", () => {
    it("creates a bound store hook with full getState/setState/subscribe API", () => {
      interface ItemStore {
        items: string[];
        filter: string;
        addItem: (item: string) => void;
      }

      const useItems = createZuiBound<ItemStore>((set) => ({
        items: ["apple"],
        filter: "all",
        addItem: item => set(state => ({ items: [...state.items, item] }))
      }));

      const container = document.createElement("div");
      const root = createRoot(container);
      let renders = 0;

      function ItemList() {
        const count = useItems(state => state.items.length);
        renders++;
        return jsx("span", { children: String(count) });
      }

      root.render(jsx(ItemList, {}));
      expect(container.textContent).toBe("1");
      expect(renders).toBe(1);

      // Unrelated state change does not re-render
      useItems.setState({ filter: "active" });
      expect(renders).toBe(1);

      // Mutate tracked state
      useItems.getState().addItem("banana");
      expect(container.textContent).toBe("2");
      expect(renders).toBe(2);

      root.unmount();
    });

    it("prevents redundant re-renders when using useShallow with object selections", () => {
      interface ComplexStore {
        count: number;
        multiplier: number;
        unrelated: string;
      }

      const store = createZuiStore<ComplexStore>(set => ({
        count: 5,
        multiplier: 2,
        unrelated: "init"
      }));

      const useBound = createZuiBound(store);
      const container = document.createElement("div");
      const root = createRoot(container);
      let renders = 0;

      function Stats() {
        const { count, total } = useBound(
          useShallow(state => ({
            count: state.count,
            total: state.count * state.multiplier
          }))
        );
        renders++;
        return jsx("span", { children: `${count} -> ${total}` });
      }

      root.render(jsx(Stats, {}));
      expect(container.textContent).toBe("5 -> 10");
      expect(renders).toBe(1);

      // Change unrelated field: useShallow returns cached object ref -> no re-render
      store.setState({ unrelated: "changed" });
      expect(renders).toBe(1);

      // Change count: should re-render
      store.setState({ count: 6 });
      expect(container.textContent).toBe("6 -> 12");
      expect(renders).toBe(2);

      root.unmount();
    });

    it("supports shallow comparison function passed as second argument to bound store", () => {
      const useStore = createZuiBound<{ a: number; b: number; c: number }>((set) => ({
        a: 1,
        b: 2,
        c: 3
      }));

      const container = document.createElement("div");
      const root = createRoot(container);
      let renders = 0;

      function Component() {
        const selected = useStore(state => ({ a: state.a, b: state.b }), shallow);
        renders++;
        return jsx("span", { children: `${selected.a}-${selected.b}` });
      }

      root.render(jsx(Component, {}));
      expect(container.textContent).toBe("1-2");
      expect(renders).toBe(1);

      // Update unrelated field c -> no re-render
      useStore.setState({ c: 99 });
      expect(renders).toBe(1);

      // Update field a -> re-render
      useStore.setState({ a: 10 });
      expect(container.textContent).toBe("10-2");
      expect(renders).toBe(2);

      root.unmount();
    });
  });
});
