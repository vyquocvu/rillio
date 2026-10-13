// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { createRoot, jsx } from "../src/compat.js";
import { useStore } from "../src/zustand.js";

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
});
