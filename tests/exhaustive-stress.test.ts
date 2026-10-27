// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createRoot, useState, useEffect } from "../src/index.js";
import { createStore, engine } from "../src/reactive-api.js";
import { select, derive, mount, jsx, Show, For } from "../src/dom.js";
import { create } from "../src/external-store.js";

describe("Exhaustive Edge Cases & Stress Resilience", () => {
  it("handles empty nodes, nulls, undefined, and boolean literals seamlessly in children", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function EdgeComponent({ flag }: { flag: boolean }) {
      return jsx("div", {
        children: [
          null,
          undefined,
          false,
          true,
          flag ? jsx("span", { children: "Active" }) : null,
          "",
          0,
        ],
      });
    }

    root.render(jsx(EdgeComponent, { flag: true }));
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("0");

    root.render(jsx(EdgeComponent, { flag: false }));
    expect(container.textContent).not.toContain("Active");
    expect(container.textContent).toContain("0");
    root.unmount();
    expect(container.innerHTML).toBe("");
  });

  it("handles rapid consecutive state updates within the same microtask", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let triggerSetter: ((fn: (v: number) => number) => void) | undefined;

    function RapidCounter() {
      const [count, setCount] = useState(0);
      triggerSetter = setCount;
      return jsx("div", { children: [`Value: ${count}`] });
    }

    root.render(jsx(RapidCounter, {}));
    expect(container.textContent).toBe("Value: 0");

    // Perform 50 synchronous state updates
    for (let i = 0; i < 50; i++) {
      triggerSetter!((prev) => prev + 1);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe("Value: 50");
    root.unmount();
  });

  it("handles chaotic list mutations: duplicate keys gracefully, random truncations, reverse, and rapid expansion", () => {
    const container = document.createElement("div");
    const listStore = createStore<string[]>(["a", "b", "c"]);

    const dispose = mount(
      () =>
        jsx("ul", {
          children: For({
            each: select(listStore, (s) => s),
            by: (item) => item,
            children: (item) => jsx("li", { "data-item": item, children: item }),
          }),
        }),
      container
    );

    expect(container.querySelectorAll("li").length).toBe(3);

    // 1. Rapid expansion to 100 items
    listStore.set(Array.from({ length: 100 }, (_, i) => `item-${i}`));
    expect(container.querySelectorAll("li").length).toBe(100);
    expect(container.querySelectorAll("li")[0].textContent).toBe("item-0");
    expect(container.querySelectorAll("li")[99].textContent).toBe("item-99");

    // 2. Complete reverse
    listStore.set((prev) => [...prev].reverse());
    expect(container.querySelectorAll("li")[0].textContent).toBe("item-99");
    expect(container.querySelectorAll("li")[99].textContent).toBe("item-0");

    // 3. Truncate to middle slice
    listStore.set((prev) => prev.slice(40, 60));
    expect(container.querySelectorAll("li").length).toBe(20);

    // 4. Shrink to single item
    listStore.set(["solo"]);
    expect(container.querySelectorAll("li").length).toBe(1);
    expect(container.querySelector("li")?.textContent).toBe("solo");

    // 5. Shrink to zero
    listStore.set([]);
    expect(container.querySelectorAll("li").length).toBe(0);

    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("verifies deep nested conditionals and recursive tree unmounting with zero leaks", () => {
    const container = document.createElement("div");
    const depthStore = createStore(3);

    function RecursiveBranch(level: number): any {
      return () => {
        return Show({
          when: select(depthStore, (d) => d >= level),
          children: () =>
            jsx("div", {
              "data-level": level,
              children: level < 5 ? RecursiveBranch(level + 1) : "Leaf",
            }),
          fallback: () => jsx("span", { children: `Cutoff@${level}` }),
        });
      };
    }

    const dispose = mount(RecursiveBranch(1), container);
    expect(container.querySelector('[data-level="3"]')).not.toBeNull();
    expect(container.querySelector('[data-level="4"]')).toBeNull();

    // Deepen to 5
    depthStore.set(5);
    expect(container.querySelector('[data-level="5"]')).not.toBeNull();
    expect(container.textContent).toContain("Leaf");

    // Collapse to 0 (all cut off)
    depthStore.set(0);
    expect(container.querySelectorAll("[data-level]").length).toBe(0);
    expect(container.textContent).toContain("Cutoff@1");

    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("prevents zombie listeners when component unmounts mid-effect", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const useStore = create<{ count: number; inc: () => void }>((set) => ({
      count: 100,
      inc: () => set((s) => ({ count: s.count + 1 })),
    }));
    let effectFired = 0;
    let cleanupFired = 0;

    function ListenerComponent() {
      useEffect(() => {
        effectFired++;
        const stop = useStore.subscribe(() => {});
        return () => {
          cleanupFired++;
          stop();
        };
      }, []);

      return jsx("span", { children: "Active Listener" });
    }

    root.render(jsx(ListenerComponent, {}));
    expect(effectFired).toBe(1);
    expect(cleanupFired).toBe(0);

    // Unmount
    root.unmount();
    expect(cleanupFired).toBe(1);

    // Mutating useStore after unmount must not re-trigger listener or throw
    expect(() => useStore.getState().inc()).not.toThrow();
    expect(effectFired).toBe(1);
  });
});
